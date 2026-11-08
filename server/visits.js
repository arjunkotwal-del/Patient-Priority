// Patient routes. The patient describes the problem and answers the AI's questions.
// Then the doctor answers once: a reply (with any prescriptions and tests), or in-person
// appointment times for the patient to pick from. There is no chat with the doctor.
// The server keeps everything in the database; the browser only ever sees the patient view.
//
//   POST /api/visits                   start a case, get the first AI question
//   POST /api/visits/:id/messages      answer the AI's question
//   GET  /api/visits/:id               the patient view: doctor's reply, prescriptions, tests, appointment
//   POST /api/visits/:id/appointment   pick one of the offered appointment times
//   GET  /api/me/visits                all my visits with unread counts (notification badge)
//   GET  /api/me/history               my past prescriptions, what each was for, and my last visit
//   POST /api/visits/:id/read          mark a visit as read
import express from 'express';
import { requireOwnVisit, requirePatient } from './access.js';
import * as db from './db.js';
import { notifyVisit } from './events.js';
import { parseInterviewRequest, runInterviewTurn, TRIAGE_MESSAGE } from './interview.js';
import { runSummary } from './summary.js';

const MAX_TEXT = 2000;
export const WAITING_MESSAGE = 'Thanks. A doctor will review your answers and reply here.';

/** Pairs each AI question with the patient's answer. The first message is the complaint. */
export function buildTranscript(messages) {
  const transcript = [];
  let question = null;
  for (const m of messages.slice(1)) {
    if (m.from === 'ai' && m.kind === 'question') question = m.text;
    else if (m.from === 'patient' && question) {
      transcript.push({ question, answer: m.text });
      question = null;
    }
  }
  return transcript;
}

/** A message from the patient: trimmed, non-empty, not too long. Null if invalid. */
export function parseMessageText(body) {
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  return text && text.length <= MAX_TEXT ? text : null;
}

/** Asks the AI for the next step and saves it. Ends the interview with a summary when done. */
async function advanceInterview(visit) {
  const history = await db.loadPatientHistory(visit.patientId);
  const input = { complaint: visit.complaint, premadeAnswers: visit.premadeAnswers, transcript: buildTranscript(visit.messages), history };

  // Red flags never stop the chat: the AI keeps asking, and the summary flags the case.
  const turn = await runInterviewTurn(input);
  if (!turn.done) {
    await db.addMessage(visit.id, { from: 'ai', kind: 'question', text: turn.question, options: turn.options });
    return { visitId: visit.id, status: 'interviewing', question: { text: turn.question, options: turn.options, allowOther: turn.allowOther } };
  }

  // Interview finished: every case goes to the doctor. Red flags put it at the top of the queue.
  const triage = await runSummary(input);
  await db.saveTriage(visit.id, triage);
  return { visitId: visit.id, status: 'waiting_for_doctor', patientMessage: WAITING_MESSAGE };
}

/** Why a patient can't send a message right now. */
function closedMessage(status) {
  if (status === 'escalated') return TRIAGE_MESSAGE;
  if (status === 'waiting_for_doctor') return 'Your answers are with the doctor. They will reply here.';
  if (status === 'appointment_offered') return 'Your doctor wants to see you in person. Pick one of the offered times.';
  if (status === 'appointment_booked') return 'Your in-person appointment is booked.';
  return 'This visit is closed. Start a new visit if you need help.';
}

/** The slot id the patient picked, or null if it isn't a positive whole number. */
export function parseSlotId(body) {
  const id = body?.slotId;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Tells doctors when an interview ends: there is a new case in the queue. */
async function announceInterviewEnd(result) {
  if (result.status === 'waiting_for_doctor') await notifyVisit(result.visitId, 'new_case', 'doctors');
}

const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof db.DatabaseUnavailableError) {
      return res.status(503).json({ code: 'records_unavailable', message: 'Patient records are unavailable right now. Please try again soon.' });
    }
    next(err);
  }
};

export const visitsRouter = express.Router();
const json = express.json({ limit: '100kb' });

visitsRouter.post(
  '/visits',
  json,
  requirePatient,
  route(async (req, res) => {
    const input = parseInterviewRequest({ complaint: req.body?.complaint, premadeAnswers: req.body?.premadeAnswers });
    if (!input) return res.status(400).json({ code: 'bad_request', message: 'Describe what is wrong and answer the check-in questions.' });

    const visitId = await db.createVisit(req.patientId, input.complaint, input.premadeAnswers);
    await db.addMessage(visitId, { from: 'patient', kind: 'answer', text: input.complaint });
    const result = await advanceInterview(await db.getVisit(visitId));
    await announceInterviewEnd(result);
    res.status(201).json(result);
  }),
);

visitsRouter.post(
  '/visits/:id/messages',
  json,
  requirePatient,
  requireOwnVisit,
  route(async (req, res) => {
    const text = parseMessageText(req.body);
    if (!text) return res.status(400).json({ code: 'bad_request', message: 'Type a message first.' });

    // Messages only go to the AI interview. There is no chat with the doctor.
    const visit = await db.getVisit(req.visitId);
    if (visit.status !== 'interviewing') {
      return res.status(409).json({ code: 'not_interviewing', status: visit.status, message: closedMessage(visit.status) });
    }
    await db.addMessage(visit.id, { from: 'patient', kind: 'answer', text });
    const result = await advanceInterview(await db.getVisit(visit.id));
    await announceInterviewEnd(result);
    res.json(result);
  }),
);

visitsRouter.post(
  '/visits/:id/appointment',
  json,
  requirePatient,
  requireOwnVisit,
  route(async (req, res) => {
    const slotId = parseSlotId(req.body);
    if (!slotId) return res.status(400).json({ code: 'bad_request', message: 'Pick one of the offered times.' });
    if (!(await db.bookAppointmentSlot(req.visitId, slotId))) {
      return res.status(409).json({ code: 'cannot_book', message: 'That time is no longer available. Reload and pick another.' });
    }
    await notifyVisit(req.visitId, 'appointment_booked', 'doctors');
    res.json(await db.getPatientView(req.visitId));
  }),
);

visitsRouter.get(
  '/visits/:id',
  requirePatient,
  requireOwnVisit,
  route(async (req, res) => {
    res.json(await db.getPatientView(req.visitId));
  }),
);

visitsRouter.post(
  '/visits/:id/read',
  requirePatient,
  requireOwnVisit,
  route(async (req, res) => {
    await db.markRead(req.visitId, 'patient');
    res.json({ ok: true });
  }),
);

visitsRouter.get(
  '/me/visits',
  requirePatient,
  route(async (req, res) => {
    const visits = await db.listPatientVisits(req.patientId);
    res.json({ visits, unreadTotal: visits.reduce((sum, v) => sum + v.unreadCount, 0) });
  }),
);

// The patient's medical history: past prescriptions, what each was for, and the last visit.
visitsRouter.get(
  '/me/history',
  requirePatient,
  route(async (req, res) => {
    res.json(await db.getPatientMedicalHistory(req.patientId));
  }),
);

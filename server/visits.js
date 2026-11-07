// Patient routes. The server keeps the whole chat in the database: the browser
// sends one message at a time and only ever sees the patient view.
//
//   POST /api/visits               start a case, get the first AI question
//   POST /api/visits/:id/messages  answer the AI, or reply to the doctor
//   GET  /api/visits/:id           the patient view: chat, plan, prescriptions, tests
//   GET  /api/me/visits            all my visits with unread counts (notification badge)
//   POST /api/visits/:id/read      mark a visit as read
import express from 'express';
import { scanForRedFlags } from '../lib/redFlags.ts';
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

const escalated = (visitId) => ({ visitId, status: 'escalated', patientMessage: TRIAGE_MESSAGE });

/** Asks the AI for the next step and saves it. Ends the interview with a summary when done. */
async function advanceInterview(visit) {
  const history = await db.loadPatientHistory(visit.patientId);
  const input = { complaint: visit.complaint, premadeAnswers: visit.premadeAnswers, transcript: buildTranscript(visit.messages), history };

  const turn = await runInterviewTurn(input);
  if (turn.escalate) {
    await db.escalateVisit(visit.id, [turn.escalateReason]);
    return escalated(visit.id);
  }
  if (!turn.done) {
    await db.addMessage(visit.id, { from: 'ai', kind: 'question', text: turn.question, options: turn.options });
    return { visitId: visit.id, status: 'interviewing', question: { text: turn.question, options: turn.options, allowOther: turn.allowOther } };
  }

  // Interview finished: the summary decides between the doctor queue and the triage desk.
  const triage = await runSummary(input);
  if (triage.escalate) {
    await db.escalateVisit(visit.id, triage.redFlags);
    return escalated(visit.id);
  }
  await db.saveTriage(visit.id, triage);
  return { visitId: visit.id, status: 'waiting_for_doctor', patientMessage: WAITING_MESSAGE };
}

/** A reply in the doctor chat. Scanned first: a red flag sends the patient to triage. */
async function replyToDoctor(visit, text) {
  await db.addMessage(visit.id, { from: 'patient', kind: 'answer', text });
  const hits = scanForRedFlags(text);
  if (hits.length > 0) {
    await db.escalateVisit(visit.id, hits.map((h) => `Red flag scanner: ${h.label}`));
    return escalated(visit.id);
  }
  // Answering the doctor's question puts the case back in their court.
  if (visit.status === 'doctor_asked') await db.setVisitStatus(visit.id, 'waiting_for_doctor');
  return { visitId: visit.id, status: 'waiting_for_doctor' };
}

/** Tells doctors when an interview ends: a new case in the queue, or one sent to triage. */
async function announceInterviewEnd(result) {
  if (result.status === 'waiting_for_doctor') await notifyVisit(result.visitId, 'new_case', 'doctors');
  else if (result.status === 'escalated') await notifyVisit(result.visitId, 'status_changed', 'doctors');
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

    const visit = await db.getVisit(req.visitId);
    if (visit.status === 'interviewing') {
      await db.addMessage(visit.id, { from: 'patient', kind: 'answer', text });
      const result = await advanceInterview(await db.getVisit(visit.id));
      await announceInterviewEnd(result);
      return res.json(result);
    }
    if (visit.status === 'waiting_for_doctor' || visit.status === 'doctor_asked') {
      const result = await replyToDoctor(visit, text);
      await notifyVisit(visit.id, result.status === 'escalated' ? 'status_changed' : 'patient_message', 'doctors');
      return res.json(result);
    }
    const message = visit.status === 'escalated' ? TRIAGE_MESSAGE : 'This visit is closed. Start a new visit if you need help.';
    res.status(409).json({ code: 'visit_closed', message });
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

// Doctor routes. Someone is a doctor only if their Auth0 login is linked to a row in the
// doctors table, and only `npm run db:setup` writes that link, so nobody can make
// themselves a doctor through the app.
//
//   GET  /api/doctor/me              { doctor: { id, name } } or { doctor: null }
//   GET  /api/doctor/queue           open patient requests, most urgent first
//   GET  /api/doctor/visits/:id      one request in full: symptoms, check-in answers,
//                                    AI summary, chat, patient history, private notes
//   POST /api/doctor/visits/:id/read mark the patient's messages as read
//
// Actions on an open case. The first one claims the case for this doctor, and a case
// another doctor has claimed can't be changed (409).
//   POST /api/doctor/visits/:id/claim          take the case
//   POST /api/doctor/visits/:id/questions      { text } ask the patient something
//   POST /api/doctor/visits/:id/prescriptions  { medication, dose, frequency, duration, instructions? }
//   POST /api/doctor/visits/:id/orders         { type, name, instructions? }
//   POST /api/doctor/visits/:id/resolve        { diagnosis, plan, confirmedCtas, ctasOverrideReason? }
// Private notes can be added to any visit, open or closed:
//   POST /api/doctor/visits/:id/notes          { text }
import express from 'express';
import { getAppMetadata } from './auth0.js';
import { requireDoctor, requireVisit } from './access.js';
import * as db from './db.js';

const MAX_SHORT = 200;
const MAX_LONG = 4000;
const ORDER_TYPES = ['lab', 'imaging', 'referral', 'other'];
const OPEN_STATUSES = ['waiting_for_doctor', 'doctor_asked'];

/** A trimmed string from the request body, or null if missing, empty or too long. */
function text(body, field, max, { optional = false } = {}) {
  const value = typeof body?.[field] === 'string' ? body[field].trim() : '';
  if (!value) return optional ? '' : null;
  return value.length <= max ? value : null;
}

/** Each parser returns clean input, or { error } with a message for the doctor. */
export function parseQuestion(body) {
  const value = text(body, 'text', MAX_LONG);
  return value ? { text: value } : { error: 'Type a question for the patient.' };
}

export function parseNote(body) {
  const value = text(body, 'text', MAX_LONG);
  return value ? { text: value } : { error: 'Type a note first.' };
}

export function parsePrescription(body) {
  const rx = {
    medication: text(body, 'medication', MAX_SHORT),
    dose: text(body, 'dose', MAX_SHORT),
    frequency: text(body, 'frequency', MAX_SHORT),
    duration: text(body, 'duration', MAX_SHORT),
    instructions: text(body, 'instructions', MAX_LONG, { optional: true }),
  };
  if (Object.values(rx).some((v) => v === null)) return { error: 'Fill in medication, dose, frequency and duration.' };
  return rx;
}

export function parseOrder(body) {
  const type = ORDER_TYPES.includes(body?.type) ? body.type : null;
  const name = text(body, 'name', MAX_SHORT);
  const instructions = text(body, 'instructions', MAX_LONG, { optional: true });
  if (!type || !name || instructions === null) return { error: 'Choose a type and name the test or referral.' };
  return { type, name, instructions };
}

/** Closing a case. Changing the AI's CTAS level needs a reason, so the change can be reviewed. */
export function parseResolve(body, suggestedCtas) {
  const diagnosis = text(body, 'diagnosis', MAX_SHORT);
  const plan = text(body, 'plan', MAX_LONG);
  const confirmedCtas = Number(body?.confirmedCtas);
  if (!diagnosis || !plan) return { error: 'Enter a diagnosis and a plan for the patient.' };
  if (!Number.isInteger(confirmedCtas) || confirmedCtas < 1 || confirmedCtas > 5) return { error: 'Choose a CTAS level from 1 to 5.' };
  const changed = suggestedCtas != null && confirmedCtas !== suggestedCtas;
  const reason = text(body, 'ctasOverrideReason', MAX_LONG, { optional: true });
  if (reason === null || (changed && !reason)) return { error: 'Say why you changed the CTAS level.' };
  return { diagnosis, plan, confirmedCtas, ctasOverrideReason: changed ? reason : null };
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

/** The patient's verified name from their health card, or null if unknown. Never throws. */
async function patientName(patientId) {
  try {
    const auth0Id = await db.getPatientAuth0Id(patientId);
    if (!auth0Id) return null;
    const legal = (await getAppMetadata(auth0Id)).health_card?.legal_name;
    return legal ? `${legal.first} ${legal.last}` : null;
  } catch (err) {
    console.warn('Patient name unavailable:', err.message);
    return null;
  }
}

/**
 * Runs an action on an open case that this doctor holds, claiming it first if nobody has.
 * Answers 409 if the case is closed or another doctor has it.
 */
async function withClaim(req, res, action) {
  if (!(await db.claimVisit(req.visitId, req.doctor.id))) {
    const visit = await db.getVisit(req.visitId);
    const message = OPEN_STATUSES.includes(visit.status)
      ? `${visit.assignedDoctor?.name ?? 'Another doctor'} is already handling this case.`
      : 'This case is closed.';
    return res.status(409).json({ code: 'not_yours', message });
  }
  await action();
  res.json({ ok: true });
}

/** Wraps a parser: answers 400 with its message when the input is bad. */
const parsed = (parse, req, res, ...extra) => {
  const input = parse(req.body, ...extra);
  if (input.error) {
    res.status(400).json({ code: 'bad_request', message: input.error });
    return null;
  }
  return input;
};

export const doctorRouter = express.Router();
const json = express.json({ limit: '100kb' });

// Not behind requireDoctor: everyone may ask, and the answer tells the app which side to show.
doctorRouter.get(
  '/doctor/me',
  route(async (req, res) => {
    res.json({ doctor: await db.getDoctorByAuth0Id(req.userId) });
  }),
);

doctorRouter.get(
  '/doctor/queue',
  requireDoctor,
  route(async (_req, res) => {
    res.json({ queue: await db.getQueue() });
  }),
);

doctorRouter.get(
  '/doctor/visits/:id',
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const visit = await db.getVisit(req.visitId);
    const [history, notes, name, unreadForDoctor] = await Promise.all([
      db.loadPatientHistory(visit.patientId),
      db.getDoctorNotes(req.visitId),
      patientName(visit.patientId),
      db.getUnreadCount(req.visitId, 'doctor'),
    ]);
    res.json({
      visit,
      patient: {
        id: visit.patientId,
        name,
        allergies: history?.allergies ?? [],
        currentMeds: history?.currentMeds ?? [],
        conditions: history?.conditions ?? [],
        pastVisits: history?.pastVisits ?? [],
      },
      notes,
      unreadForDoctor,
    });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/read',
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    await db.markRead(req.visitId, 'doctor');
    res.json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/claim',
  requireDoctor,
  requireVisit,
  route(async (req, res) => withClaim(req, res, async () => {})),
);

doctorRouter.post(
  '/doctor/visits/:id/questions',
  json,
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const input = parsed(parseQuestion, req, res);
    if (!input) return;
    await withClaim(req, res, async () => {
      await db.addMessage(req.visitId, { from: 'doctor', kind: 'question', text: input.text });
      await db.setVisitStatus(req.visitId, 'doctor_asked');
    });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/prescriptions',
  json,
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const input = parsed(parsePrescription, req, res);
    if (!input) return;
    await withClaim(req, res, () => db.addPrescription(req.visitId, req.doctor.id, input));
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/orders',
  json,
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const input = parsed(parseOrder, req, res);
    if (!input) return;
    await withClaim(req, res, () => db.addOrder(req.visitId, req.doctor.id, input));
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/resolve',
  json,
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const visit = await db.getVisit(req.visitId);
    const input = parsed(parseResolve, req, res, visit.suggestedCtas);
    if (!input) return;
    await withClaim(req, res, async () => {
      // The plan goes to the patient as a chat message; the AI's assessment is kept as the clinical summary.
      await db.addMessage(req.visitId, { from: 'doctor', kind: 'plan', text: input.plan });
      await db.resolveVisit(req.visitId, { doctorId: req.doctor.id, summary: visit.soap?.assessment ?? input.diagnosis, ...input });
    });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/notes',
  json,
  requireDoctor,
  requireVisit,
  route(async (req, res) => {
    const input = parsed(parseNote, req, res);
    if (!input) return;
    await db.addDoctorNote(req.visitId, req.doctor.id, input.text);
    res.json({ ok: true });
  }),
);

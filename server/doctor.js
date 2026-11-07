// Doctor routes. Every route needs a doctor login (requireDoctor), and every
// open or change is written to the access log.
//
//   GET  /api/doctor/queue                     waiting cases, most urgent first
//   POST /api/doctor/visits/:id/claim          take a case
//   GET  /api/doctor/visits/:id                full case: chat, SOAP, history, notes
//   POST /api/doctor/visits/:id/messages       ask a question or send a plan
//   POST /api/doctor/visits/:id/prescriptions  prescribe
//   POST /api/doctor/visits/:id/orders         order a test or referral
//   POST /api/doctor/visits/:id/notes          private note (never shown to the patient)
//   POST /api/doctor/visits/:id/resolve        close the case
//   POST /api/doctor/visits/:id/escalate       send the patient to the triage desk
import express from 'express';
import { requireDoctor, requireVisit } from './access.js';
import * as db from './db.js';

const OPEN = new Set(['waiting_for_doctor', 'doctor_asked']);
const ORDER_TYPES = new Set(['lab', 'imaging', 'referral', 'other']);

/** A required string field, trimmed. Null if missing, empty or too long. */
function text(value, max = 2000) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s && s.length <= max ? s : null;
}
/** An optional string field. Empty string if missing, null if too long. */
function optionalText(value, max = 2000) {
  if (value === undefined || value === null || value === '') return '';
  return text(value, max);
}

// ---- Validators: each returns the clean value, or { error } ----

export function parseReply(body) {
  const kind = body?.kind;
  const t = text(body?.text);
  if (kind !== 'question' && kind !== 'plan') return { error: 'kind must be "question" or "plan".' };
  if (!t) return { error: 'Write a message first.' };
  return { kind, text: t };
}

export function parsePrescription(body) {
  const rx = {
    medication: text(body?.medication, 200),
    dose: text(body?.dose, 200),
    frequency: text(body?.frequency, 200),
    duration: text(body?.duration, 200),
    instructions: optionalText(body?.instructions, 1000),
  };
  if (Object.values(rx).some((v) => v === null)) return { error: 'Medication, dose, frequency and duration are required.' };
  return rx;
}

export function parseOrder(body) {
  if (!ORDER_TYPES.has(body?.type)) return { error: 'type must be lab, imaging, referral or other.' };
  const name = text(body?.name, 200);
  const instructions = optionalText(body?.instructions, 1000);
  if (!name || instructions === null) return { error: 'Name the test or referral.' };
  return { type: body.type, name, instructions };
}

/**
 * The doctor confirms or changes the AI's suggested CTAS. Changing it needs a reason.
 * CTAS 1 to 3 is not a minor case, so it must go through escalate instead.
 */
export function parseResolve(body, suggestedCtas) {
  const diagnosis = text(body?.diagnosis, 500);
  const plan = text(body?.plan);
  const summary = optionalText(body?.summary);
  const reason = optionalText(body?.ctasOverrideReason, 1000);
  const ctas = body?.confirmedCtas;
  if (!diagnosis || !plan || summary === null || reason === null) return { error: 'Diagnosis and plan are required.' };
  if (ctas !== 4 && ctas !== 5) return { error: 'Confirm CTAS 4 or 5. For anything more urgent, escalate the case instead.' };
  if (suggestedCtas && ctas !== suggestedCtas && !reason) return { error: 'Give a reason for changing the suggested CTAS.' };
  return { diagnosis, plan, summary, confirmedCtas: ctas, ctasOverrideReason: reason || null };
}

// ---- Helpers ----

const fail = (res, status, code, message) => res.status(status).json({ code, message });

const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof db.DatabaseUnavailableError) return fail(res, 503, 'records_unavailable', 'Patient records are unavailable right now.');
    next(err);
  }
};

/**
 * Loads a case this doctor may change: it must still be open, and either theirs or
 * unclaimed (then they claim it). Sends the error and returns null otherwise.
 */
async function loadMyOpenCase(req, res) {
  const visit = await db.getVisit(req.visitId);
  if (!OPEN.has(visit.status)) return fail(res, 409, 'visit_closed', `This case is ${visit.status.replaceAll('_', ' ')}.`), null;
  if (!(await db.claimVisit(visit.id, req.doctor.id))) {
    return fail(res, 409, 'claimed_by_other', `${visit.assignedDoctor?.name ?? 'Another doctor'} has this case.`), null;
  }
  return visit;
}

// ---- Routes ----

export const doctorRouter = express.Router();
const json = express.json({ limit: '100kb' });
const doctorCase = [requireDoctor, requireVisit];

doctorRouter.get(
  '/doctor/queue',
  requireDoctor,
  route(async (_req, res) => res.json({ queue: await db.getQueue() })),
);

doctorRouter.post(
  '/doctor/visits/:id/claim',
  ...doctorCase,
  route(async (req, res) => {
    if (!(await loadMyOpenCase(req, res))) return;
    await db.logAccess(req.doctor.id, req.visitId, 'claimed');
    res.json({ ok: true });
  }),
);

doctorRouter.get(
  '/doctor/visits/:id',
  ...doctorCase,
  route(async (req, res) => {
    const visit = await db.getVisit(req.visitId);
    const [notes, history] = await Promise.all([db.getDoctorNotes(req.visitId), db.getPatientHistory({ patientId: visit.patientId })]);
    await Promise.all([db.logAccess(req.doctor.id, req.visitId, 'viewed'), db.markRead(req.visitId, 'doctor')]);
    res.json({ visit, notes, history });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/messages',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const reply = parseReply(req.body);
    if (reply.error) return fail(res, 400, 'bad_request', reply.error);
    if (!(await loadMyOpenCase(req, res))) return;

    await db.addMessage(req.visitId, { from: 'doctor', kind: reply.kind, text: reply.text });
    // A question waits on the patient; a plan leaves the case with the doctor to resolve.
    if (reply.kind === 'question') await db.setVisitStatus(req.visitId, 'doctor_asked');
    await Promise.all([db.logAccess(req.doctor.id, req.visitId, `sent_${reply.kind}`), db.markRead(req.visitId, 'doctor')]);
    res.status(201).json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/prescriptions',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const rx = parsePrescription(req.body);
    if (rx.error) return fail(res, 400, 'bad_request', rx.error);
    if (!(await loadMyOpenCase(req, res))) return;
    await db.addPrescription(req.visitId, req.doctor.id, rx);
    await db.logAccess(req.doctor.id, req.visitId, 'prescribed');
    res.status(201).json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/orders',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const order = parseOrder(req.body);
    if (order.error) return fail(res, 400, 'bad_request', order.error);
    if (!(await loadMyOpenCase(req, res))) return;
    await db.addOrder(req.visitId, req.doctor.id, order);
    await db.logAccess(req.doctor.id, req.visitId, 'ordered');
    res.status(201).json({ ok: true });
  }),
);

// Notes can be added to any case, open or closed, by any doctor.
doctorRouter.post(
  '/doctor/visits/:id/notes',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const note = text(req.body?.text);
    if (!note) return fail(res, 400, 'bad_request', 'Write a note first.');
    await db.addDoctorNote(req.visitId, req.doctor.id, note);
    await db.logAccess(req.doctor.id, req.visitId, 'noted');
    res.status(201).json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/resolve',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const visit = await loadMyOpenCase(req, res);
    if (!visit) return;
    const result = parseResolve(req.body, visit.suggestedCtas);
    if (result.error) return fail(res, 400, 'bad_request', result.error);

    await db.resolveVisit(req.visitId, {
      doctorId: req.doctor.id,
      diagnosis: result.diagnosis,
      // The history entry future interviews see. Falls back to the AI's subjective note.
      summary: result.summary || visit.soap?.subjective || visit.complaint,
      plan: result.plan,
      confirmedCtas: result.confirmedCtas,
      ctasOverrideReason: result.ctasOverrideReason,
    });
    await db.logAccess(req.doctor.id, req.visitId, 'resolved');
    res.json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/escalate',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const reason = text(req.body?.reason, 500);
    if (!reason) return fail(res, 400, 'bad_request', 'Give a reason for escalating.');
    if (!(await loadMyOpenCase(req, res))) return;
    await db.escalateVisit(req.visitId, [`Doctor: ${reason}`]);
    await db.logAccess(req.doctor.id, req.visitId, 'escalated');
    res.json({ ok: true });
  }),
);

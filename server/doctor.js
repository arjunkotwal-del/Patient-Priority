// Doctor routes. There is no back-and-forth chat: after reading the case, the doctor
// either sends ONE reply (like an email, with any prescriptions and tests), or offers
// in-person appointment times for the patient to pick from. Every route needs a doctor
// login, and every open or change is written to the access log.
//
//   GET  /api/doctor/me                      { doctor: { id, name } } or { doctor: null }: which side of the app to show
//   GET  /api/doctor/queue                   cases waiting for an answer, longest wait first
//   GET  /api/doctor/appointments            in-person appointments offered or booked
//   POST /api/doctor/visits/:id/claim        take a case
//   GET  /api/doctor/visits/:id              full case: chat, summary, history, notes
//   POST /api/doctor/visits/:id/reply        the one reply: message, diagnosis, prescriptions, tests
//   POST /api/doctor/visits/:id/appointment  offer in-person appointment times
//   POST /api/doctor/visits/:id/notes        private note (never shown to the patient)
//   POST /api/doctor/visits/:id/escalate     send the patient to the triage desk
import express from 'express';
import { requireDoctor, requireVisit } from './access.js';
import * as db from './db.js';
import { notifyVisit } from './events.js';

const ORDER_TYPES = new Set(['lab', 'imaging', 'referral', 'other']);
const MAX_ITEMS = 10;
const MAX_SLOTS = 4;
const MIN_LEAD_MS = 15 * 60 * 1000;
const MAX_AHEAD_MS = 60 * 24 * 60 * 60 * 1000;

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

export function parsePrescription(body) {
  const rx = {
    medication: text(body?.medication, 200),
    dose: text(body?.dose, 200),
    frequency: text(body?.frequency, 200),
    duration: text(body?.duration, 200),
    instructions: optionalText(body?.instructions, 1000),
  };
  if (Object.values(rx).some((v) => v === null)) return { error: 'Each prescription needs medication, dose, frequency and duration.' };
  return rx;
}

export function parseOrder(body) {
  if (!ORDER_TYPES.has(body?.type)) return { error: 'Each test type must be lab, imaging, referral or other.' };
  const name = text(body?.name, 200);
  const instructions = optionalText(body?.instructions, 1000);
  if (!name || instructions === null) return { error: 'Name each test or referral.' };
  return { type: body.type, name, instructions };
}

function parseList(value, parseItem, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return { error: `${label} must be a list of at most ${MAX_ITEMS}.` };
  const items = value.map(parseItem);
  return items.find((i) => i.error) ?? items;
}

/**
 * The doctor's one reply. Confirming or changing the AI's suggested CTAS: a change needs
 * a reason, and CTAS 1 to 3 is not minor, so it must go through escalate instead.
 */
export function parseDoctorReply(body, suggestedCtas) {
  const message = text(body?.message, 5000);
  const diagnosis = text(body?.diagnosis, 500);
  const summary = optionalText(body?.summary);
  const reason = optionalText(body?.ctasOverrideReason, 1000);
  const ctas = body?.confirmedCtas;
  if (!message) return { error: 'Write the message for the patient.' };
  if (!diagnosis || summary === null || reason === null) return { error: 'A diagnosis is required.' };
  if (ctas !== 4 && ctas !== 5) return { error: 'Confirm CTAS 4 or 5. For anything more urgent, escalate the case instead.' };
  if (suggestedCtas && ctas !== suggestedCtas && !reason) return { error: 'Give a reason for changing the suggested CTAS.' };
  const prescriptions = parseList(body?.prescriptions, parsePrescription, 'prescriptions');
  if (prescriptions.error) return prescriptions;
  const orders = parseList(body?.orders, parseOrder, 'orders');
  if (orders.error) return orders;
  return { message, diagnosis, summary, confirmedCtas: ctas, ctasOverrideReason: reason || null, prescriptions, orders };
}

/** In-person appointment offer: 1 to 4 future times (ISO strings) at one location. */
export function parseAppointmentOffer(body, now = Date.now()) {
  const message = text(body?.message, 5000);
  const location = text(body?.location, 200);
  if (!message) return { error: 'Write the message for the patient.' };
  if (!location) return { error: 'Say where the appointment is.' };
  if (!Array.isArray(body?.slots) || body.slots.length < 1 || body.slots.length > MAX_SLOTS) {
    return { error: `Offer between 1 and ${MAX_SLOTS} times.` };
  }
  const times = body.slots.map((s) => (typeof s === 'string' ? Date.parse(s) : NaN));
  if (times.some((t) => Number.isNaN(t))) return { error: 'Each time must be a date and time, like 2026-11-08T14:30:00-05:00.' };
  if (times.some((t) => t < now + MIN_LEAD_MS || t > now + MAX_AHEAD_MS)) return { error: 'Times must be at least 15 minutes from now and within 60 days.' };
  if (new Set(times).size !== times.length) return { error: 'Each time can only be offered once.' };
  return { message, location, slots: times.sort((a, b) => a - b).map((t) => new Date(t).toISOString()) };
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

const WORKABLE = new Set(['waiting_for_doctor', 'appointment_offered', 'appointment_booked']);

/**
 * Loads a case this doctor may act on: it must be in one of `allowed` statuses, and either
 * theirs or unclaimed (then they claim it). Sends the error and returns null otherwise.
 */
async function loadMyCase(req, res, allowed = WORKABLE) {
  const visit = await db.getVisit(req.visitId);
  if (!allowed.has(visit.status)) return fail(res, 409, 'wrong_status', `This case is ${visit.status.replaceAll('_', ' ')}.`), null;
  if (!(await db.claimVisit(visit.id, req.doctor.id))) {
    return fail(res, 409, 'claimed_by_other', `${visit.assignedDoctor?.name ?? 'Another doctor'} has this case.`), null;
  }
  return visit;
}

// ---- Routes ----

export const doctorRouter = express.Router();
const json = express.json({ limit: '100kb' });
const doctorCase = [requireDoctor, requireVisit];

// Not behind requireDoctor: anyone may ask, and the answer tells the app which side to show.
doctorRouter.get(
  '/doctor/me',
  route(async (req, res) => res.json({ doctor: await db.getDoctorByAuth0Id(req.userId) })),
);

doctorRouter.get(
  '/doctor/queue',
  requireDoctor,
  route(async (_req, res) => res.json({ queue: await db.getQueue() })),
);

doctorRouter.get(
  '/doctor/appointments',
  requireDoctor,
  route(async (_req, res) => res.json({ appointments: await db.listAppointments() })),
);

doctorRouter.post(
  '/doctor/visits/:id/claim',
  ...doctorCase,
  route(async (req, res) => {
    if (!(await loadMyCase(req, res))) return;
    await db.logAccess(req.doctor.id, req.visitId, 'claimed');
    await notifyVisit(req.visitId, 'status_changed', 'doctors');
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

// The one reply. Also used after an in-person appointment to close the case.
doctorRouter.post(
  '/doctor/visits/:id/reply',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const visit = await loadMyCase(req, res, new Set(['waiting_for_doctor', 'appointment_booked']));
    if (!visit) return;
    const reply = parseDoctorReply(req.body, visit.suggestedCtas);
    if (reply.error) return fail(res, 400, 'bad_request', reply.error);

    // The history entry future interviews see. Falls back to the AI's subjective note.
    const summary = reply.summary || visit.soap?.subjective || visit.complaint;
    if (!(await db.sendDoctorReply(req.visitId, req.doctor.id, { ...reply, summary }))) {
      return fail(res, 409, 'wrong_status', 'This case changed. Reload it and try again.');
    }
    await db.logAccess(req.doctor.id, req.visitId, 'replied');
    await notifyVisit(req.visitId, 'doctor_reply');
    res.json({ ok: true });
  }),
);

doctorRouter.post(
  '/doctor/visits/:id/appointment',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const offer = parseAppointmentOffer(req.body);
    if (offer.error) return fail(res, 400, 'bad_request', offer.error);
    if (!(await loadMyCase(req, res, new Set(['waiting_for_doctor'])))) return;
    if (!(await db.offerAppointment(req.visitId, req.doctor.id, offer))) {
      return fail(res, 409, 'wrong_status', 'This case changed. Reload it and try again.');
    }
    await db.logAccess(req.doctor.id, req.visitId, 'offered_appointment');
    await notifyVisit(req.visitId, 'appointment_offered');
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
  '/doctor/visits/:id/escalate',
  json,
  ...doctorCase,
  route(async (req, res) => {
    const reason = text(req.body?.reason, 500);
    if (!reason) return fail(res, 400, 'bad_request', 'Give a reason for escalating.');
    if (!(await loadMyCase(req, res))) return;
    await db.escalateVisit(req.visitId, [`Doctor: ${reason}`]);
    await db.logAccess(req.doctor.id, req.visitId, 'escalated');
    await notifyVisit(req.visitId, 'status_changed');
    res.json({ ok: true });
  }),
);

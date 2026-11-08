// Patient history in Postgres (TigerData). Server only: the browser never talks to the database.
// Without DATABASE_URL, the fake demo patients are used instead, so the app still runs.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { doctorIdFromUserId } from './doctorIds.js';

const VISITS_LOADED = 20;
// TigerData signs its certificates with its own CA (ca.timescale.com), which Node
// doesn't trust by default. We trust that one CA and keep full verification on.
const TIGER_CA = new URL('../db/tiger-ca.pem', import.meta.url);
let pool = null;

/** Connection settings with TLS verified against TigerData's CA. */
export function connectionOptions() {
  const url = new URL(process.env.DATABASE_URL);
  // sslmode in the URL would replace the ssl settings below, so it is removed.
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), ssl: { ca: readFileSync(TIGER_CA, 'utf8'), rejectUnauthorized: true } };
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({ ...connectionOptions(), max: 5, connectionTimeoutMillis: 5000 });
    // The database closes idle connections now and then. Without this listener that error
    // would crash the whole server; with it, the pool just opens a fresh connection next time.
    pool.on('error', (err) => console.warn('Database connection dropped:', err.message));
  }
  return pool;
}

/** Finds a patient by our id or by their Auth0 user id. Returns PatientHistory or null. */
export async function getPatientHistory({ patientId, auth0UserId }) {
  const db = getPool();
  if (!db) return patientId && Object.hasOwn(DEMO_PATIENTS, patientId) ? DEMO_PATIENTS[patientId] : null;

  const key = patientId ?? auth0UserId;
  if (!key) return null;
  const column = patientId ? 'id' : 'auth0_user_id';
  const { rows } = await db.query(`SELECT id, allergies, current_meds, conditions FROM patients WHERE ${column} = $1`, [key]);
  if (rows.length === 0) return null;

  const patient = rows[0];
  // Only finished visits count as history. Open cases are still being worked on.
  const visits = await db.query(
    `SELECT v.visit_date::text AS date, v.complaint, COALESCE(v.summary, '') AS summary, COALESCE(v.plan, '') AS plan,
            v.diagnosis, d.name AS "doctorName",
            COALESCE(array_agg(p.medication || ' ' || p.dose ORDER BY p.id) FILTER (WHERE p.id IS NOT NULL), '{}') AS prescriptions
     FROM past_visits v
     LEFT JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN prescriptions p ON p.visit_id = v.id
     WHERE v.patient_id = $1 AND v.status = 'resolved'
     GROUP BY v.id, d.name
     ORDER BY v.visit_date DESC, v.id DESC
     LIMIT $2`,
    [patient.id, VISITS_LOADED],
  );
  return {
    patientId: patient.id,
    allergies: patient.allergies,
    currentMeds: patient.current_meds,
    conditions: patient.conditions,
    pastVisits: visits.rows,
  };
}

// ---- Visits: one per case, with its full chat, doctor, diagnosis and prescriptions ----

/** Thrown when DATABASE_URL isn't set, so routes can answer 503 instead of a generic error. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super('Missing env var DATABASE_URL');
    this.name = 'DatabaseUnavailableError';
  }
}

function requirePool() {
  const db = getPool();
  if (!db) throw new DatabaseUnavailableError();
  return db;
}

// ---- Who is who: logged-in users mapped to patients and doctors ----

/**
 * The doctor for a logged-in user id, or null for patients. Only doctor logins
 * ("doctor|<id>", see doctorAuth.js) can be doctors, so Auth0 users never touch the database here.
 * A doctor whose login was removed (no password) is no longer a doctor.
 */
export async function getDoctorForUser(userId) {
  const doctorId = doctorIdFromUserId(userId);
  if (!doctorId) return null;
  const { rows } = await requirePool().query('SELECT id, name FROM doctors WHERE id = $1 AND password_hash IS NOT NULL', [doctorId]);
  return rows[0] ?? null;
}

/** The doctor's login record for an email, or null. Includes the password hash: server use only. */
export async function getDoctorLogin(email) {
  const { rows } = await requirePool().query(
    'SELECT id, name, password_hash FROM doctors WHERE lower(email) = lower($1) AND password_hash IS NOT NULL',
    [email],
  );
  return rows[0] ? { id: rows[0].id, name: rows[0].name, passwordHash: rows[0].password_hash } : null;
}

/** The patient id for this Auth0 user. Creates an empty patient record on their first visit. */
export async function getOrCreatePatientId(auth0UserId) {
  const { rows } = await requirePool().query(
    `INSERT INTO patients (id, auth0_user_id) VALUES ($1, $2)
     ON CONFLICT (auth0_user_id) DO UPDATE SET auth0_user_id = EXCLUDED.auth0_user_id
     RETURNING id`,
    [`p_${randomUUID()}`, auth0UserId],
  );
  return rows[0].id;
}

/** Records that a doctor opened or changed a patient's record. action is e.g. "viewed" or "prescribed". */
export async function logAccess(doctorId, visitId, action) {
  await requirePool().query(
    `INSERT INTO access_log (doctor_id, patient_id, visit_id, action)
     SELECT $1, patient_id, id, $3 FROM past_visits WHERE id = $2`,
    [doctorId, visitId, action],
  );
}

/** Which patient a visit belongs to, or null if the visit doesn't exist. */
export async function getVisitPatientId(visitId) {
  const { rows } = await requirePool().query('SELECT patient_id FROM past_visits WHERE id = $1', [visitId]);
  return rows[0]?.patient_id ?? null;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

/** Opens a new case when the patient checks in. Returns the visit id. */
export async function createVisit(patientId, complaint, premadeAnswers = []) {
  const { rows } = await requirePool().query(
    `INSERT INTO past_visits (patient_id, complaint, status, premade_answers) VALUES ($1, $2, 'interviewing', $3) RETURNING id`,
    [patientId, complaint, JSON.stringify(premadeAnswers)],
  );
  return Number(rows[0].id);
}

/** Saves one chat message. sender is "patient", "ai" or "doctor"; kind is "question", "answer" or "plan". */
export async function addMessage(visitId, { from, kind, text, options = null }) {
  await requirePool().query('INSERT INTO visit_messages (visit_id, sender, kind, text, options) VALUES ($1, $2, $3, $4, $5)', [
    visitId,
    from,
    kind,
    text,
    options?.length ? options : null,
  ]);
}

/** Sends the case to the triage desk, keeping any SOAP note and adding the reasons for staff. */
export async function escalateVisit(visitId, reasons) {
  await requirePool().query(
    `UPDATE past_visits SET status = 'escalated', suggested_ctas = COALESCE(suggested_ctas, 3),
            red_flags = ARRAY(SELECT DISTINCT unnest(red_flags || $2::text[]))
     WHERE id = $1`,
    [visitId, reasons],
  );
}

/** A patient's visits, newest first, with unread counts for the notification badge. */
export async function listPatientVisits(patientId) {
  const { rows } = await requirePool().query(
    `SELECT v.id, v.complaint, v.status, v.started_at, v.resolved_at, COALESCE(d.name, a.name) AS doctor_name,
            (SELECT count(*)::int FROM visit_messages m
             WHERE m.visit_id = v.id AND m.sender = 'doctor'
               AND (v.patient_read_at IS NULL OR m.sent_at > v.patient_read_at)) AS unread_count
     FROM past_visits v
     LEFT JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN doctors a ON a.id = v.assigned_doctor_id
     WHERE v.patient_id = $1
     ORDER BY v.started_at DESC, v.id DESC`,
    [patientId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    complaint: r.complaint,
    status: r.status,
    startedAt: iso(r.started_at),
    resolvedAt: iso(r.resolved_at),
    doctorName: r.doctor_name,
    unreadCount: r.unread_count,
  }));
}

/**
 * The patient's own medical history: every medicine a doctor prescribed them, what it was for,
 * and when they last visited. Only their own visits; nothing staff-only (no notes, SOAP or flags).
 */
export async function getPatientMedicalHistory(patientId) {
  const pool = requirePool();
  const [meds, last] = await Promise.all([
    pool.query(
      `SELECT p.medication, p.dose, p.frequency, p.duration, p.instructions, p.prescribed_at,
              d.name AS doctor_name, v.id AS visit_id, v.complaint, v.diagnosis
       FROM prescriptions p
       JOIN past_visits v ON v.id = p.visit_id
       JOIN doctors d ON d.id = p.doctor_id
       WHERE v.patient_id = $1
       ORDER BY p.prescribed_at DESC, p.id DESC`,
      [patientId],
    ),
    pool.query(
      `SELECT v.id, v.complaint, v.started_at, count(*) OVER ()::int AS total
       FROM past_visits v WHERE v.patient_id = $1
       ORDER BY v.started_at DESC, v.id DESC LIMIT 1`,
      [patientId],
    ),
  ]);
  const lastRow = last.rows[0];
  return {
    lastVisit: lastRow ? { visitId: Number(lastRow.id), complaint: lastRow.complaint, startedAt: iso(lastRow.started_at) } : null,
    totalVisits: lastRow?.total ?? 0,
    prescriptions: meds.rows.map((r) => ({
      medication: r.medication,
      dose: r.dose,
      frequency: r.frequency,
      duration: r.duration,
      instructions: r.instructions,
      prescribedAt: iso(r.prescribed_at),
      doctorName: r.doctor_name,
      visitId: Number(r.visit_id),
      // What it was for: the doctor's diagnosis, or the patient's own complaint if there is none.
      forWhat: r.diagnosis || r.complaint,
      complaint: r.complaint,
    })),
  };
}

/** History for a known patient id. Never throws: without it, the interview carries on. */
export async function loadPatientHistory(patientId) {
  try {
    return await getPatientHistory({ patientId });
  } catch (err) {
    console.warn('History unavailable:', err.message);
    return null;
  }
}

/** Saves the AI summary and moves the case to the doctor queue, or marks it escalated. */
/** Hands a finished interview to the doctors. Flagged cases go too: red flags only raise priority. */
export async function saveTriage(visitId, { redFlags, suggestedCtas, soap, priority = null, priorityReasons = [], painScore = null }) {
  const hasSummary = soap && Object.values(soap).some((part) => part);
  await requirePool().query(
    `UPDATE past_visits SET status = 'waiting_for_doctor', red_flags = $2, suggested_ctas = $3, soap = $4, priority = $5, priority_reasons = $6,
            pain_score = $7
     WHERE id = $1`,
    [visitId, redFlags, suggestedCtas, hasSummary ? soap : null, priority, priorityReasons, painScore],
  );
}

/** Runs fn(client) in one transaction: either every change is saved, or none is. */
async function inTransaction(fn) {
  const client = await requirePool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---- The doctor's answer: one reply, or an in-person appointment offer ----

/**
 * The doctor's one reply, like an email: a message for the patient plus the diagnosis,
 * prescriptions and tests. Closes the case. Works on a waiting case, or after the patient's
 * in-person appointment. Returns false if the case isn't in one of those states.
 */
export async function sendDoctorReply(visitId, doctorId, reply) {
  const { message, diagnosis, summary, confirmedCtas, ctasOverrideReason = null, prescriptions = [], orders = [] } = reply;
  return inTransaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE past_visits
       SET status = 'resolved', doctor_id = $2, diagnosis = $3, summary = $4, plan = $5, confirmed_ctas = $6,
           ctas_override_reason = $7, resolved_at = now()
       WHERE id = $1 AND status IN ('waiting_for_doctor', 'appointment_booked')`,
      [visitId, doctorId, diagnosis, summary, message, confirmedCtas, ctasOverrideReason],
    );
    if (rowCount !== 1) return false;
    await c.query(`INSERT INTO visit_messages (visit_id, sender, kind, text) VALUES ($1, 'doctor', 'plan', $2)`, [visitId, message]);
    for (const rx of prescriptions) {
      await c.query(
        `INSERT INTO prescriptions (visit_id, doctor_id, medication, dose, frequency, duration, instructions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [visitId, doctorId, rx.medication, rx.dose, rx.frequency, rx.duration, rx.instructions ?? ''],
      );
    }
    for (const o of orders) {
      await c.query('INSERT INTO orders (visit_id, doctor_id, type, name, instructions) VALUES ($1, $2, $3, $4, $5)', [
        visitId,
        doctorId,
        o.type,
        o.name,
        o.instructions ?? '',
      ]);
    }
    return true;
  });
}

/**
 * The doctor needs to see the patient in person: offers a few times at one location.
 * Only for a waiting case. Returns false otherwise.
 */
export async function offerAppointment(visitId, doctorId, { message, location, description = '', slots }) {
  return inTransaction(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE past_visits SET status = 'appointment_offered' WHERE id = $1 AND status = 'waiting_for_doctor'`,
      [visitId],
    );
    if (rowCount !== 1) return false;
    const { rows } = await c.query(
      'INSERT INTO appointments (visit_id, doctor_id, location, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [visitId, doctorId, location, description],
    );
    for (const startsAt of slots) {
      await c.query('INSERT INTO appointment_slots (appointment_id, starts_at) VALUES ($1, $2)', [rows[0].id, startsAt]);
    }
    await c.query(`INSERT INTO visit_messages (visit_id, sender, kind, text) VALUES ($1, 'doctor', 'appointment', $2)`, [visitId, message]);
    return true;
  });
}

/**
 * The patient picks one of the offered times. Returns false if there is no open offer,
 * the slot isn't part of it, or the time has already passed.
 */
export async function bookAppointmentSlot(visitId, slotId) {
  return inTransaction(async (c) => {
    const { rows } = await c.query(
      `UPDATE appointments a SET status = 'booked', booked_at = now()
       WHERE a.visit_id = $1 AND a.status = 'offered'
         AND EXISTS (SELECT 1 FROM appointment_slots s WHERE s.id = $2 AND s.appointment_id = a.id AND s.starts_at > now())
       RETURNING a.id`,
      [visitId, slotId],
    );
    if (rows.length === 0) return false;
    await c.query('UPDATE appointment_slots SET chosen = (id = $2) WHERE appointment_id = $1', [rows[0].id, slotId]);
    await c.query(`UPDATE past_visits SET status = 'appointment_booked' WHERE id = $1`, [visitId]);
    return true;
  });
}

async function getAppointment(db, visitId) {
  const { rows } = await db.query(
    `SELECT a.id, a.location, a.description, a.status, a.booked_at, d.name AS doctor_name FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id WHERE a.visit_id = $1`,
    [visitId],
  );
  if (rows.length === 0) return null;
  const a = rows[0];
  const slots = await db.query('SELECT id, starts_at, chosen FROM appointment_slots WHERE appointment_id = $1 ORDER BY starts_at', [a.id]);
  return {
    location: a.location,
    description: a.description ?? '',
    status: a.status,
    bookedAt: iso(a.booked_at),
    doctorName: a.doctor_name,
    slots: slots.rows.map((s) => ({ id: Number(s.id), startsAt: iso(s.starts_at), chosen: s.chosen })),
  };
}

/** Upcoming in-person appointments for the doctor dashboard, soonest first. */
export async function listAppointments() {
  const { rows } = await requirePool().query(
    `SELECT v.id AS visit_id, v.patient_id, v.complaint, a.status, a.location, d.name AS doctor_name,
            (SELECT min(s.starts_at) FROM appointment_slots s WHERE s.appointment_id = a.id AND (a.status = 'offered' OR s.chosen)) AS next_time
     FROM appointments a
     JOIN past_visits v ON v.id = a.visit_id
     JOIN doctors d ON d.id = a.doctor_id
     WHERE v.status IN ('appointment_offered', 'appointment_booked')
     ORDER BY next_time ASC NULLS LAST`,
  );
  return rows.map((r) => ({
    visitId: Number(r.visit_id),
    patientId: r.patient_id,
    complaint: r.complaint,
    status: r.status,
    location: r.location,
    doctorName: r.doctor_name,
    // The booked time, or the earliest offered time while the patient hasn't picked yet.
    time: iso(r.next_time),
  }));
}

// Cases a doctor has taken off the queue: advice sent (resolved) or a meeting scheduled.
const HISTORY_STATUSES = { all: ['resolved', 'appointment_offered', 'appointment_booked'], advice: ['resolved'], meeting: ['appointment_offered', 'appointment_booked'] };
const HISTORY_LIMIT = 100;

/** Escapes % and _ so a search for "50%" means the text, not a wildcard. */
const likePattern = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Past cases for the doctor History page, newest first.
 *   q        searches complaint, diagnosis, patient id, summary, plan and doctor name
 *   outcome  'all' | 'advice' | 'meeting'
 *   doctorId only cases this doctor closed, if set
 */
export async function searchHistory({ q = '', outcome = 'all', doctorId = null } = {}) {
  const statuses = HISTORY_STATUSES[outcome] ?? HISTORY_STATUSES.all;
  const params = [statuses];
  const where = ['v.status = ANY($1)'];
  if (q) {
    params.push(likePattern(q));
    const n = `$${params.length}`;
    where.push(`(v.complaint ILIKE ${n} OR v.diagnosis ILIKE ${n} OR v.patient_id ILIKE ${n} OR v.summary ILIKE ${n}
             OR v.plan ILIKE ${n} OR COALESCE(d.name, ad.name, '') ILIKE ${n})`);
  }
  if (doctorId) {
    params.push(doctorId);
    where.push(`COALESCE(v.doctor_id, a.doctor_id) = $${params.length}`);
  }
  params.push(HISTORY_LIMIT + 1);
  const { rows } = await requirePool().query(
    `SELECT v.id, v.patient_id, v.complaint, v.status, v.diagnosis, v.priority, v.suggested_ctas, v.confirmed_ctas,
            v.started_at, COALESCE(v.resolved_at, a.created_at, v.started_at) AS closed_at,
            COALESCE(d.name, ad.name) AS doctor_name
     FROM past_visits v
     LEFT JOIN appointments a ON a.visit_id = v.id
     LEFT JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN doctors ad ON ad.id = a.doctor_id
     WHERE ${where.join(' AND ')}
     ORDER BY closed_at DESC, v.id DESC
     LIMIT $${params.length}`,
    params,
  );
  return {
    cases: rows.slice(0, HISTORY_LIMIT).map((r) => ({
      visitId: Number(r.id),
      patientId: r.patient_id,
      complaint: r.complaint,
      status: r.status,
      diagnosis: r.diagnosis,
      priority: r.priority,
      ctas: r.confirmed_ctas ?? r.suggested_ctas,
      startedAt: iso(r.started_at),
      closedAt: iso(r.closed_at),
      doctorName: r.doctor_name,
    })),
    more: rows.length > HISTORY_LIMIT,
  };
}

/**
 * Deletes a case from the history (advice sent or meeting scheduled), with its chat,
 * prescriptions, tests and appointment. Logs the deletion first, since the log row
 * outlives the visit. Returns the patient id, or null if the case isn't in the history.
 */
export async function deleteHistoryVisit(visitId, doctorId) {
  return inTransaction(async (c) => {
    const { rows } = await c.query('SELECT patient_id FROM past_visits WHERE id = $1 AND status = ANY($2) FOR UPDATE', [
      visitId,
      HISTORY_STATUSES.all,
    ]);
    if (rows.length === 0) return null;
    await c.query(`INSERT INTO access_log (doctor_id, patient_id, visit_id, action) VALUES ($1, $2, $3, 'deleted')`, [
      doctorId,
      rows[0].patient_id,
      visitId,
    ]);
    await c.query('DELETE FROM past_visits WHERE id = $1', [visitId]);
    return rows[0].patient_id;
  });
}

/**
 * A doctor takes a case. Returns true if they now have it, false if another doctor
 * already does or the case is closed. Claiming your own case again is fine.
 */
export async function claimVisit(visitId, doctorId) {
  const { rowCount } = await requirePool().query(
    `UPDATE past_visits SET assigned_doctor_id = $2, assigned_at = COALESCE(assigned_at, now())
     WHERE id = $1 AND status IN ('waiting_for_doctor', 'appointment_offered', 'appointment_booked')
       AND (assigned_doctor_id IS NULL OR assigned_doctor_id = $2)`,
    [visitId, doctorId],
  );
  return rowCount === 1;
}

/**
 * Cases waiting for the doctor's answer, worst first:
 *   1. red flags: flagged cases first
 *   2. priority: high, medium, low (keyword rules plus the AI's rating, see lib/priority.ts)
 *   3. CTAS: lower is more urgent (unrated last)
 *   4. pain score: higher first (none given last)
 *   5. wait: longest first
 * The reasons go to the doctor so they can see why a case is at the front.
 */
export async function getQueue() {
  const { rows } = await requirePool().query(
    `SELECT v.id, v.patient_id, v.complaint, v.status, v.suggested_ctas, v.priority, v.priority_reasons, v.red_flags, v.pain_score, v.started_at,
            floor(extract(epoch FROM now() - v.started_at) / 60)::int AS waiting_minutes,
            v.assigned_doctor_id, d.name AS assigned_doctor_name,
            (SELECT count(*)::int FROM visit_messages m
             WHERE m.visit_id = v.id AND m.sender = 'patient'
               AND (v.doctor_read_at IS NULL OR m.sent_at > v.doctor_read_at)) AS unread_for_doctor
     FROM past_visits v LEFT JOIN doctors d ON d.id = v.assigned_doctor_id
     WHERE v.status = 'waiting_for_doctor'
     ORDER BY cardinality(v.red_flags) = 0,
              CASE v.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 2 END,
              v.suggested_ctas ASC NULLS LAST,
              v.pain_score DESC NULLS LAST,
              v.started_at ASC, v.id ASC`,
  );
  return rows.map((r) => ({
    visitId: Number(r.id),
    patientId: r.patient_id,
    complaint: r.complaint,
    status: r.status,
    suggestedCtas: r.suggested_ctas,
    priority: r.priority ?? 'medium',
    priorityReasons: r.priority_reasons,
    redFlags: r.red_flags ?? [],
    painScore: r.pain_score,
    startedAt: iso(r.started_at),
    waitingMinutes: r.waiting_minutes,
    assignedDoctor: r.assigned_doctor_id ? { id: r.assigned_doctor_id, name: r.assigned_doctor_name } : null,
    unreadForDoctor: r.unread_for_doctor,
  }));
}

const READ_COLUMN = { patient: 'patient_read_at', doctor: 'doctor_read_at' };
// Each side's unread messages are the ones the other side sent.
const OTHER_SENDER = { patient: 'doctor', doctor: 'patient' };

/** Marks everything in a visit as read for "patient" or "doctor". */
export async function markRead(visitId, who) {
  const column = READ_COLUMN[who];
  if (!column) throw new Error(`Unknown reader: ${who}`);
  await requirePool().query(`UPDATE past_visits SET ${column} = now() WHERE id = $1`, [visitId]);
}

/** How many messages "patient" or "doctor" hasn't read yet in a visit. */
export async function getUnreadCount(visitId, who) {
  const column = READ_COLUMN[who];
  if (!column) throw new Error(`Unknown reader: ${who}`);
  const { rows } = await requirePool().query(
    `SELECT count(*)::int AS unread FROM visit_messages m JOIN past_visits v ON v.id = m.visit_id
     WHERE m.visit_id = $1 AND m.sender = $2 AND (v.${column} IS NULL OR m.sent_at > v.${column})`,
    [visitId, OTHER_SENDER[who]],
  );
  return rows[0].unread;
}

/**
 * Cuts a full visit down to what the patient may see. Leaves out the SOAP note, red flags,
 * CTAS levels, the clinical summary and anything else for staff only.
 */
export function toPatientView(visit, unreadCount = 0) {
  return {
    id: visit.id,
    status: visit.status,
    complaint: visit.complaint,
    startedAt: visit.startedAt,
    resolvedAt: visit.resolvedAt,
    doctorName: visit.doctor?.name ?? visit.assignedDoctor?.name ?? null,
    diagnosis: visit.diagnosis,
    plan: visit.plan,
    // The patient's own check-in answers, so their chat shows the whole conversation.
    premadeAnswers: visit.premadeAnswers ?? [],
    messages: visit.messages,
    prescriptions: visit.prescriptions,
    orders: visit.orders,
    appointment: visit.appointment,
    unreadCount,
  };
}

/** The patient-safe view of a visit, or null if it doesn't exist. */
export async function getPatientView(visitId) {
  const visit = await getVisit(visitId);
  return visit && toPatientView(visit, await getUnreadCount(visitId, 'patient'));
}

/** Saves a private note. Doctors only: never show these to the patient or send them to the AI. */
export async function addDoctorNote(visitId, doctorId, text) {
  await requirePool().query('INSERT INTO doctor_notes (visit_id, doctor_id, text) VALUES ($1, $2, $3)', [visitId, doctorId, text]);
}

/** A visit's private notes, oldest first. Only call this from doctor-only code. */
export async function getDoctorNotes(visitId) {
  const { rows } = await requirePool().query(
    `SELECT n.text, n.written_at, d.name AS doctor_name FROM doctor_notes n JOIN doctors d ON d.id = n.doctor_id
     WHERE n.visit_id = $1 ORDER BY n.written_at, n.id`,
    [visitId],
  );
  return rows.map((n) => ({ text: n.text, writtenAt: iso(n.written_at), doctorName: n.doctor_name }));
}

/** Everything about one visit, or null if it doesn't exist. Doctor notes are left out on purpose. */
export async function getVisit(visitId) {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT v.*, d.name AS doctor_name, a.name AS assigned_doctor_name
     FROM past_visits v
     LEFT JOIN doctors d ON d.id = v.doctor_id
     LEFT JOIN doctors a ON a.id = v.assigned_doctor_id
     WHERE v.id = $1`,
    [visitId],
  );
  if (rows.length === 0) return null;
  const v = rows[0];
  const [messages, prescriptions, orders, appointment] = await Promise.all([
    db.query('SELECT sender, kind, text, options, sent_at FROM visit_messages WHERE visit_id = $1 ORDER BY sent_at, id', [visitId]),
    db.query(
      `SELECT p.*, d.name AS doctor_name FROM prescriptions p JOIN doctors d ON d.id = p.doctor_id
       WHERE p.visit_id = $1 ORDER BY p.prescribed_at, p.id`,
      [visitId],
    ),
    db.query(
      `SELECT o.*, d.name AS doctor_name FROM orders o JOIN doctors d ON d.id = o.doctor_id
       WHERE o.visit_id = $1 ORDER BY o.ordered_at, o.id`,
      [visitId],
    ),
    getAppointment(db, visitId),
  ]);
  return {
    id: Number(v.id),
    patientId: v.patient_id,
    status: v.status,
    complaint: v.complaint,
    startedAt: iso(v.started_at),
    resolvedAt: iso(v.resolved_at),
    doctor: v.doctor_id ? { id: v.doctor_id, name: v.doctor_name } : null,
    assignedDoctor: v.assigned_doctor_id ? { id: v.assigned_doctor_id, name: v.assigned_doctor_name } : null,
    diagnosis: v.diagnosis,
    summary: v.summary,
    plan: v.plan,
    suggestedCtas: v.suggested_ctas,
    priority: v.priority,
    priorityReasons: v.priority_reasons,
    confirmedCtas: v.confirmed_ctas,
    ctasOverrideReason: v.ctas_override_reason,
    redFlags: v.red_flags,
    soap: v.soap,
    premadeAnswers: v.premade_answers,
    messages: messages.rows.map((m) => ({ from: m.sender, kind: m.kind, text: m.text, options: m.options, sentAt: iso(m.sent_at) })),
    prescriptions: prescriptions.rows.map((p) => ({
      medication: p.medication,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      prescribedAt: iso(p.prescribed_at),
      doctorName: p.doctor_name,
    })),
    orders: orders.rows.map((o) => ({
      type: o.type,
      name: o.name,
      instructions: o.instructions,
      orderedAt: iso(o.ordered_at),
      doctorName: o.doctor_name,
    })),
    appointment,
  };
}

/** The patient's most recent visit, open or finished, with the full chat. Null if they have none. */
export async function getLastVisit(patientId) {
  const { rows } = await requirePool().query(
    'SELECT id FROM past_visits WHERE patient_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1',
    [patientId],
  );
  return rows.length ? getVisit(rows[0].id) : null;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

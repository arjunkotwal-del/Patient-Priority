// Patient history in Postgres (TigerData). Server only: the browser never talks to the database.
// Without DATABASE_URL, the fake demo patients are used instead, so the app still runs.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DEMO_PATIENTS } from '../lib/history.ts';

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
  pool ??= new pg.Pool({ ...connectionOptions(), max: 5, connectionTimeoutMillis: 5000 });
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

/**
 * Loads history for an interview. A demoPatientId (only ids starting with "demo-") picks
 * a fake patient; otherwise we look up the logged-in user. Never throws: if the database
 * is down, the interview carries on without history.
 */
export async function loadHistory(demoPatientId, auth0UserId) {
  const isDemo = typeof demoPatientId === 'string' && demoPatientId.startsWith('demo-');
  try {
    return await getPatientHistory(isDemo ? { patientId: demoPatientId } : { auth0UserId });
  } catch (err) {
    console.warn('History unavailable:', err.message);
    return null;
  }
}

// ---- Visits: one per case, with its full chat, doctor, diagnosis and prescriptions ----

function requirePool() {
  const db = getPool();
  if (!db) throw new Error('Missing env var DATABASE_URL');
  return db;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);

/** Opens a new case when the patient checks in. Returns the visit id. */
export async function createVisit(patientId, complaint) {
  const { rows } = await requirePool().query(
    `INSERT INTO past_visits (patient_id, complaint, status) VALUES ($1, $2, 'interviewing') RETURNING id`,
    [patientId, complaint],
  );
  return Number(rows[0].id);
}

/** Saves one chat message. sender is "patient", "ai" or "doctor"; kind is "question", "answer" or "plan". */
export async function addMessage(visitId, { from, kind, text }) {
  await requirePool().query('INSERT INTO visit_messages (visit_id, sender, kind, text) VALUES ($1, $2, $3, $4)', [visitId, from, kind, text]);
}

/** Saves the AI summary and moves the case to the doctor queue, or marks it escalated. */
export async function saveTriage(visitId, { escalate, redFlags, suggestedCtas, soap }) {
  await requirePool().query(
    `UPDATE past_visits SET status = $2, red_flags = $3, suggested_ctas = $4, soap = $5 WHERE id = $1`,
    [visitId, escalate ? 'escalated' : 'waiting_for_doctor', redFlags, suggestedCtas, escalate ? null : soap],
  );
}

/** Changes the case status, e.g. to "doctor_asked" when the doctor sends a question. */
export async function setVisitStatus(visitId, status) {
  await requirePool().query('UPDATE past_visits SET status = $2 WHERE id = $1', [visitId, status]);
}

/** Saves a prescription written by a doctor for this visit. */
export async function addPrescription(visitId, doctorId, { medication, dose, frequency, duration, instructions = '' }) {
  await requirePool().query(
    `INSERT INTO prescriptions (visit_id, doctor_id, medication, dose, frequency, duration, instructions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [visitId, doctorId, medication, dose, frequency, duration, instructions],
  );
}

/** Closes the case. It then shows up in the patient's history for future visits. */
export async function resolveVisit(visitId, { doctorId, diagnosis, summary, plan, confirmedCtas = null }) {
  await requirePool().query(
    `UPDATE past_visits
     SET status = 'resolved', doctor_id = $2, diagnosis = $3, summary = $4, plan = $5, confirmed_ctas = $6, resolved_at = now()
     WHERE id = $1`,
    [visitId, doctorId, diagnosis, summary, plan, confirmedCtas],
  );
}

/** Everything about one visit, or null if it doesn't exist. */
export async function getVisit(visitId) {
  const db = requirePool();
  const { rows } = await db.query(
    `SELECT v.*, d.name AS doctor_name FROM past_visits v LEFT JOIN doctors d ON d.id = v.doctor_id WHERE v.id = $1`,
    [visitId],
  );
  if (rows.length === 0) return null;
  const v = rows[0];
  const [messages, prescriptions] = await Promise.all([
    db.query('SELECT sender, kind, text, sent_at FROM visit_messages WHERE visit_id = $1 ORDER BY sent_at, id', [visitId]),
    db.query(
      `SELECT p.*, d.name AS doctor_name FROM prescriptions p JOIN doctors d ON d.id = p.doctor_id
       WHERE p.visit_id = $1 ORDER BY p.prescribed_at, p.id`,
      [visitId],
    ),
  ]);
  return {
    id: Number(v.id),
    patientId: v.patient_id,
    status: v.status,
    complaint: v.complaint,
    startedAt: iso(v.started_at),
    resolvedAt: iso(v.resolved_at),
    doctor: v.doctor_id ? { id: v.doctor_id, name: v.doctor_name } : null,
    diagnosis: v.diagnosis,
    summary: v.summary,
    plan: v.plan,
    suggestedCtas: v.suggested_ctas,
    confirmedCtas: v.confirmed_ctas,
    redFlags: v.red_flags,
    soap: v.soap,
    messages: messages.rows.map((m) => ({ from: m.sender, kind: m.kind, text: m.text, sentAt: iso(m.sent_at) })),
    prescriptions: prescriptions.rows.map((p) => ({
      medication: p.medication,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions,
      prescribedAt: iso(p.prescribed_at),
      doctorName: p.doctor_name,
    })),
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

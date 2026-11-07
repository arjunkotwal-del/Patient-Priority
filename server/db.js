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
  const visits = await db.query(
    `SELECT visit_date::text AS date, complaint, summary, plan
     FROM past_visits WHERE patient_id = $1 ORDER BY visit_date DESC LIMIT $2`,
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

/** Saves a resolved case as a past visit. Call this when the doctor resolves a case. */
export async function addPastVisit(patientId, { date, complaint, summary, plan }) {
  const db = getPool();
  if (!db) throw new Error('Missing env var DATABASE_URL');
  await db.query('INSERT INTO past_visits (patient_id, visit_date, complaint, summary, plan) VALUES ($1, $2, $3, $4, $5)', [
    patientId,
    date,
    complaint,
    summary,
    plan,
  ]);
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

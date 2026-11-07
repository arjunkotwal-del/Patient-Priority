// npm run db:setup -> creates the tables and loads the fake demo patients.
// Safe to run again: it resets the demo patients and leaves everyone else alone.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { connectionOptions } from './db.js';
import { DEMO_DOCTOR, DEMO_OPEN_CASES, DEMO_VISIT_DETAILS } from './demoData.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* rely on real environment variables */
}
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const client = new pg.Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO doctors (id, name, license_number) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = $2, license_number = $3`,
    [DEMO_DOCTOR.id, DEMO_DOCTOR.name, DEMO_DOCTOR.licenseNumber],
  );
  for (const p of Object.values(DEMO_PATIENTS)) {
    await client.query(
      `INSERT INTO patients (id, allergies, current_meds, conditions) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET allergies = $2, current_meds = $3, conditions = $4`,
      [p.patientId, p.allergies, p.currentMeds, p.conditions],
    );
    // Deleting a visit also deletes its messages and prescriptions.
    await client.query('DELETE FROM past_visits WHERE patient_id = $1', [p.patientId]);
    for (const v of p.pastVisits) {
      const details = DEMO_VISIT_DETAILS[`${p.patientId}:${v.date}`];
      const started = `${v.date} ${details?.startTime ?? '12:00'}`;
      const { rows } = await client.query(
        `INSERT INTO past_visits
           (patient_id, visit_date, complaint, summary, plan, status, doctor_id, diagnosis, confirmed_ctas, started_at, resolved_at)
         VALUES ($1, $2, $3, $4, $5, 'resolved', $6, $7, $8,
                 $9::timestamp AT TIME ZONE 'America/Toronto',
                 ($9::timestamp + interval '45 minutes') AT TIME ZONE 'America/Toronto')
         RETURNING id, started_at`,
        [p.patientId, v.date, v.complaint, v.summary, v.plan, details ? DEMO_DOCTOR.id : null, details?.diagnosis ?? null, details?.confirmedCtas ?? null, started],
      );
      const { id, started_at: startedAt } = rows[0];
      for (const [minutes, sender, kind, text] of details?.messages ?? []) {
        await client.query(
          `INSERT INTO visit_messages (visit_id, sender, kind, text, sent_at) VALUES ($1, $2, $3, $4, $5::timestamptz + make_interval(mins => $6))`,
          [id, sender, kind, text, startedAt, minutes],
        );
      }
      for (const [minutes, text] of details?.doctorNotes ?? []) {
        await client.query(
          `INSERT INTO doctor_notes (visit_id, doctor_id, text, written_at) VALUES ($1, $2, $3, $4::timestamptz + make_interval(mins => $5))`,
          [id, DEMO_DOCTOR.id, text, startedAt, minutes],
        );
      }
      for (const rx of details?.prescriptions ?? []) {
        await client.query(
          `INSERT INTO prescriptions (visit_id, doctor_id, medication, dose, frequency, duration, instructions, prescribed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz + interval '40 minutes')`,
          [id, DEMO_DOCTOR.id, rx.medication, rx.dose, rx.frequency, rx.duration, rx.instructions, startedAt],
        );
      }
      for (const [minutes, type, name, instructions] of details?.orders ?? []) {
        await client.query(
          `INSERT INTO orders (visit_id, doctor_id, type, name, instructions, ordered_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz + make_interval(mins => $7))`,
          [id, DEMO_DOCTOR.id, type, name, instructions, startedAt, minutes],
        );
      }
    }
  }
  // Open cases are timed relative to now, so they always look freshly waiting.
  for (const c of DEMO_OPEN_CASES) {
    const { rows } = await client.query(
      `INSERT INTO past_visits (patient_id, complaint, status, suggested_ctas, soap, priority, priority_reasons, started_at)
       VALUES ($1, $2, 'waiting_for_doctor', $3, $4, $6, $7, now() - make_interval(mins => $5))
       RETURNING id, started_at`,
      [c.patientId, c.complaint, c.suggestedCtas, c.soap, c.minutesAgo, c.priority, c.priorityReasons],
    );
    const { id, started_at: startedAt } = rows[0];
    for (const [minutes, sender, kind, text] of c.messages) {
      await client.query(
        `INSERT INTO visit_messages (visit_id, sender, kind, text, sent_at) VALUES ($1, $2, $3, $4, $5::timestamptz + make_interval(mins => $6))`,
        [id, sender, kind, text, startedAt, minutes],
      );
    }
  }
  // Optional: link real Auth0 logins to the demo doctor and a demo patient.
  // Only this script adds doctors, so nobody can become one through the app.
  // The env settings are the source of truth: blank means no demo login is linked.
  const links = [];
  await client.query('UPDATE doctors SET auth0_user_id = NULL WHERE id = $1', [DEMO_DOCTOR.id]);
  await client.query('UPDATE patients SET auth0_user_id = NULL WHERE id = ANY($1)', [Object.keys(DEMO_PATIENTS)]);
  const doctorLogin = process.env.DEMO_DOCTOR_AUTH0_ID?.trim();
  if (doctorLogin) {
    await client.query('UPDATE doctors SET auth0_user_id = NULL WHERE auth0_user_id = $1 AND id <> $2', [doctorLogin, DEMO_DOCTOR.id]);
    await client.query('UPDATE doctors SET auth0_user_id = $1 WHERE id = $2', [doctorLogin, DEMO_DOCTOR.id]);
    links.push(`doctor login -> ${DEMO_DOCTOR.name}`);
  }
  const patientLogin = process.env.DEMO_PATIENT_AUTH0_ID?.trim();
  const demoPatientId = process.env.DEMO_PATIENT_ID?.trim() || 'demo-maya';
  if (patientLogin) {
    if (!Object.hasOwn(DEMO_PATIENTS, demoPatientId)) throw new Error(`DEMO_PATIENT_ID must be one of: ${Object.keys(DEMO_PATIENTS).join(', ')}`);
    await client.query('UPDATE patients SET auth0_user_id = NULL WHERE auth0_user_id = $1 AND id <> $2', [patientLogin, demoPatientId]);
    await client.query('UPDATE patients SET auth0_user_id = $1 WHERE id = $2', [patientLogin, demoPatientId]);
    links.push(`patient login -> ${demoPatientId}`);
  }
  await client.query('COMMIT');
  if (links.length) console.log(`Linked: ${links.join(', ')}.`);
  const { rows } = await client.query(
    `SELECT (SELECT count(*)::int FROM patients) AS patients, (SELECT count(*)::int FROM past_visits) AS visits,
            (SELECT count(*)::int FROM past_visits WHERE status = 'waiting_for_doctor') AS waiting,
            (SELECT count(*)::int FROM visit_messages) AS messages, (SELECT count(*)::int FROM prescriptions) AS prescriptions,
            (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM doctor_notes) AS notes`,
  );
  const c = rows[0];
  console.log(
    `Database ready: ${c.patients} patients, ${c.visits} visits (${c.waiting} waiting), ${c.messages} messages, ` +
      `${c.prescriptions} prescriptions, ${c.orders} orders, ${c.notes} doctor notes.`,
  );
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

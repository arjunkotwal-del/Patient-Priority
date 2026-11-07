// npm run db:setup -> creates the tables and loads the fake demo patients.
// Safe to run again: it resets the demo patients and leaves everyone else alone.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { connectionOptions } from './db.js';
import { DEMO_DOCTOR, DEMO_VISIT_DETAILS } from './demoData.js';

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
    }
  }
  await client.query('COMMIT');
  const { rows } = await client.query(
    `SELECT (SELECT count(*)::int FROM patients) AS patients, (SELECT count(*)::int FROM past_visits) AS visits,
            (SELECT count(*)::int FROM visit_messages) AS messages, (SELECT count(*)::int FROM prescriptions) AS prescriptions,
            (SELECT count(*)::int FROM doctor_notes) AS notes`,
  );
  const c = rows[0];
  console.log(
    `Database ready: ${c.patients} patients, ${c.visits} visits, ${c.messages} messages, ${c.prescriptions} prescriptions, ${c.notes} doctor notes.`,
  );
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

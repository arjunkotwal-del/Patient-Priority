// npm run db:setup -> creates the tables and loads the fake demo patients.
// Safe to run again: it resets the demo patients and leaves everyone else alone.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { connectionOptions } from './db.js';

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
  for (const p of Object.values(DEMO_PATIENTS)) {
    await client.query(
      `INSERT INTO patients (id, allergies, current_meds, conditions) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET allergies = $2, current_meds = $3, conditions = $4`,
      [p.patientId, p.allergies, p.currentMeds, p.conditions],
    );
    await client.query('DELETE FROM past_visits WHERE patient_id = $1', [p.patientId]);
    for (const v of p.pastVisits) {
      await client.query('INSERT INTO past_visits (patient_id, visit_date, complaint, summary, plan) VALUES ($1, $2, $3, $4, $5)', [
        p.patientId,
        v.date,
        v.complaint,
        v.summary,
        v.plan,
      ]);
    }
  }
  await client.query('COMMIT');
  const { rows } = await client.query('SELECT count(*)::int AS patients, (SELECT count(*)::int FROM past_visits) AS visits FROM patients');
  console.log(`Database ready: ${rows[0].patients} patients, ${rows[0].visits} past visits.`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

// npm run doctor:demo
//
// Gives the demo doctor, Dr. Sam Rivera (demo), a fixed email and password so you can log in
// at /doctor/login. Safe to run more than once; it resets the demo password each time.
// Doesn't touch any patient data. Change the login with DEMO_DOCTOR_EMAIL / DEMO_DOCTOR_PASSWORD.
import pg from 'pg';
import { connectionOptions } from './db.js';
import { DEMO_DOCTOR, DEMO_DOCTOR_LOGIN } from './demoData.js';
import { DOCTOR_LOGIN_COLUMNS_SQL, hashPassword } from './doctorAuth.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* rely on real environment variables */
}
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local. The doctor list lives in the database, so this needs it.');
  process.exit(1);
}

const { email, password } = DEMO_DOCTOR_LOGIN();
const client = new pg.Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query(DOCTOR_LOGIN_COLUMNS_SQL);
  await client.query('UPDATE doctors SET email = NULL WHERE lower(email) = $1 AND id <> $2', [email, DEMO_DOCTOR.id]);
  const { rowCount } = await client.query('UPDATE doctors SET email = $2, password_hash = $3 WHERE id = $1', [
    DEMO_DOCTOR.id,
    email,
    await hashPassword(password),
  ]);
  if (!rowCount) {
    console.error('The demo doctor is not in the database yet. Run npm run db:setup first.');
    process.exit(1);
  }
  console.log(`Done. Log in at /doctor/login with:\n  email:    ${email}\n  password: ${password}`);
} finally {
  await client.end();
}

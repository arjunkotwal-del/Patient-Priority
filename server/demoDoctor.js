// npm run doctor:demo
//
// Creates (or reuses) a shared demo doctor login with a fixed email and password,
// and links it to Dr. Sam Rivera (demo). Safe to run more than once.
// Change the login with DEMO_DOCTOR_EMAIL / DEMO_DOCTOR_PASSWORD in .env.local.
import pg from 'pg';
import { createPasswordUser, findUserIdsByEmail } from './auth0.js';
import { connectionOptions } from './db.js';
import { DEMO_DOCTOR } from './demoData.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* rely on real environment variables */
}

const email = process.env.DEMO_DOCTOR_EMAIL?.trim() || 'doctor@example.com';
const password = process.env.DEMO_DOCTOR_PASSWORD?.trim() || 'DemoDoctor123!';
const DEMO_DOCTOR_ID = DEMO_DOCTOR.id;

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local. The doctor list lives in the database, so this needs it.');
  process.exit(1);
}

let [userId] = await findUserIdsByEmail(email);
if (userId) {
  console.log(`${email} already has an Auth0 login (${userId}). Its password was not changed.`);
} else {
  userId = await createPasswordUser(email, password);
  console.log(`Created Auth0 login ${email} (${userId}).`);
}

const client = new pg.Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query('UPDATE doctors SET auth0_user_id = NULL WHERE auth0_user_id = $1 AND id <> $2', [userId, DEMO_DOCTOR_ID]);
  const { rowCount } = await client.query('UPDATE doctors SET auth0_user_id = $1 WHERE id = $2', [userId, DEMO_DOCTOR_ID]);
  if (!rowCount) {
    console.error('The demo doctor is not in the database yet. Run npm run db:setup first, then this again.');
    process.exit(1);
  }
  console.log(`Done. Log in as the doctor with:\n  email:    ${email}\n  password: ${password}`);
} finally {
  await client.end();
}

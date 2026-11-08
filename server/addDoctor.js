// npm run doctor:add -- <email> "<Full name>" [license number]
//
// Creates a doctor account (or updates one with the same email) with an email and password.
// This is the only way to get a doctor login: the doctor login page has no sign-up.
// The password comes from DOCTOR_PASSWORD if set; otherwise a random one is made and printed once.
//
// npm run doctor:remove -- <email>   takes doctor access away again (the login stops working).
import pg from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { connectionOptions } from './db.js';
import { DOCTOR_LOGIN_COLUMNS_SQL, hashPassword, passwordProblem } from './doctorAuth.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* rely on real environment variables */
}

const remove = process.argv.includes('--remove');
const [rawEmail, name, license = null] = process.argv.slice(2).filter((a) => a !== '--remove');
const email = rawEmail?.trim().toLowerCase();
if (!email || !email.includes('@') || (!remove && !name)) {
  console.error('Usage: npm run doctor:add -- <email> "<Full name>" [license number]');
  console.error('       npm run doctor:remove -- <email>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const chosen = process.env.DOCTOR_PASSWORD;
const password = chosen || randomBytes(12).toString('base64url');
const problem = !remove && passwordProblem(password);
if (problem) {
  console.error(`DOCTOR_PASSWORD is too weak: ${problem}`);
  process.exit(1);
}

const client = new pg.Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query(DOCTOR_LOGIN_COLUMNS_SQL);
  if (remove) {
    const { rowCount } = await client.query('UPDATE doctors SET password_hash = NULL WHERE lower(email) = $1', [email]);
    console.log(rowCount ? `${email} can no longer log in as a doctor.` : `${email} was not a doctor.`);
  } else {
    const hash = await hashPassword(password);
    const { rows } = await client.query('SELECT id FROM doctors WHERE lower(email) = $1', [email]);
    let id = rows[0]?.id;
    if (id) {
      await client.query('UPDATE doctors SET name = $2, license_number = $3, password_hash = $4 WHERE id = $1', [id, name, license, hash]);
    } else {
      id = `dr_${randomUUID()}`;
      await client.query(
        'INSERT INTO doctors (id, name, license_number, email, password_hash) VALUES ($1, $2, $3, $4, $5)',
        [id, name, license, email, hash],
      );
    }
    console.log(`${name} (${id}) can now log in at /doctor/login with:`);
    console.log(`  email:    ${email}`);
    console.log(`  password: ${chosen ? '(the DOCTOR_PASSWORD you set)' : password}`);
  }
} finally {
  await client.end();
}

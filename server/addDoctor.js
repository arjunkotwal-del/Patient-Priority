// npm run doctor:add -- <email> "<Full name>" [license number]
//
// Makes an existing login a doctor. The person signs up on the normal login page first;
// this finds their Auth0 account by email and adds them to the doctors table.
// This script is the only way to become a doctor: the app itself can't do it.
//
// npm run doctor:remove -- <email>   takes doctor access away again.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { findUserIdsByEmail } from './auth0.js';
import { connectionOptions } from './db.js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* rely on real environment variables */
}

const remove = process.argv.includes('--remove');
const [email, name, license = null] = process.argv.slice(2).filter((a) => a !== '--remove');
if (!email || (!remove && !name)) {
  console.error('Usage: npm run doctor:add -- <email> "<Full name>" [license number]');
  console.error('       npm run doctor:remove -- <email>');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env.local');
  process.exit(1);
}

const ids = await findUserIdsByEmail(email);
if (ids.length === 0) {
  console.error(`No Auth0 account uses ${email}. Sign up with it on the login page first, then run this again.`);
  process.exit(1);
}
if (ids.length > 1 && !remove) {
  console.error(`${email} has ${ids.length} logins (${ids.join(', ')}). Log in with just one method, or link them in Auth0.`);
  process.exit(1);
}

const client = new pg.Client({ ...connectionOptions(), connectionTimeoutMillis: 10000 });
await client.connect();
try {
  if (remove) {
    const { rowCount } = await client.query('UPDATE doctors SET auth0_user_id = NULL WHERE auth0_user_id = ANY($1)', [ids]);
    console.log(rowCount ? `${email} is no longer a doctor.` : `${email} was not a doctor.`);
  } else {
    // Re-running for the same login updates the name and license instead of adding a second doctor.
    const { rows } = await client.query(
      `INSERT INTO doctors (id, name, license_number, auth0_user_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (auth0_user_id) DO UPDATE SET name = EXCLUDED.name, license_number = EXCLUDED.license_number
       RETURNING id`,
      [`dr_${randomUUID()}`, name, license, ids[0]],
    );
    console.log(`${email} is now a doctor: ${name} (${rows[0].id}). They'll see the clinician workspace next time they log in.`);
  }
} finally {
  await client.end();
}

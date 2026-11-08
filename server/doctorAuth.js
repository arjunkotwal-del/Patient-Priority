// Doctor login. Doctors don't use Auth0: their email and password live in the doctors
// table and are created only by `npm run doctor:add` (or the demo scripts). There is no
// sign-up route, so the only accounts that can log in here are ones that already exist.
//
//   POST /api/doctor/login { email, password } -> { token, expiresAt, doctor: { id, name }, email }
//
// The token is our own short-lived JWT (HS256). requireUser accepts it next to Auth0's
// tokens and sets req.userId to "doctor|<doctor id>". Auth0 logins are always patients.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { SignJWT, jwtVerify } from 'jose';
import * as db from './db.js';
import { doctorUserId, isDoctorUserId } from './doctorIds.js';

const scryptAsync = promisify(scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;
const SESSION_HOURS = 12;
const ISSUER = 'patient-priority';
const AUDIENCE = 'patient-priority-doctor';

/** Adds the login columns to an existing database. Safe to run more than once. */
export const DOCTOR_LOGIN_COLUMNS_SQL = `
  ALTER TABLE doctors ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE doctors ADD COLUMN IF NOT EXISTS password_hash TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS doctors_email ON doctors (lower(email));
`;

// ---- Passwords ----

/** Stored as "scrypt$N$r$p$salt$hash" (base64 parts). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return timingSafeEqual(actual, expected);
}

/** Rules for passwords set by the admin scripts. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  return null;
}

// A real hash to compare against when the email is unknown, so both cases take the same time.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

// ---- Session tokens ----

/** DOCTOR_SESSION_SECRET if set, otherwise a key derived from HEALTH_CARD_HASH_KEY. */
function secret() {
  const raw = process.env.DOCTOR_SESSION_SECRET || process.env.HEALTH_CARD_HASH_KEY;
  const buf = raw ? Buffer.from(raw, 'base64') : null;
  if (!buf || buf.length < 32) throw new Error('Set DOCTOR_SESSION_SECRET (base64, 32 bytes) for doctor logins');
  return createHmac('sha256', buf).update('doctor-session-v1').digest();
}

export async function issueDoctorToken(doctorId) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(doctorUserId(doctorId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Returns "doctor|<id>" for a valid doctor token. Throws otherwise. */
export async function verifyDoctorToken(token) {
  const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
  if (!isDoctorUserId(payload.sub)) throw new Error('Not a doctor token');
  return payload.sub;
}

// ---- Login route (mounted before the login check) ----

// Slows password guessing: per email and per address, within 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRIES = 10;
const tries = new Map();
function tooMany(key) {
  const now = Date.now();
  const recent = (tries.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  tries.set(key, recent);
  return recent.length > MAX_TRIES;
}

export const doctorAuthRouter = express.Router();

doctorAuthRouter.post('/doctor/login', express.json({ limit: '2kb' }), async (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password || email.length > 320 || password.length > 200) {
    return res.status(400).json({ code: 'bad_request', message: 'Enter your email and password.' });
  }
  const emailLimited = tooMany(`email:${email}`);
  const ipLimited = tooMany(`ip:${req.ip}`);
  if (emailLimited || ipLimited) {
    return res.status(429).json({ code: 'rate_limited', message: 'Too many attempts. Try again in 15 minutes.' });
  }
  try {
    const account = await db.getDoctorLogin(email);
    const ok = await verifyPassword(password, account?.passwordHash ?? (await dummyHash));
    if (!account || !ok) return res.status(401).json({ code: 'bad_login', message: 'Wrong email or password.' });
    const { token, expiresAt } = await issueDoctorToken(account.id);
    res.json({ token, expiresAt, doctor: { id: account.id, name: account.name }, email });
  } catch (err) {
    if (err instanceof db.DatabaseUnavailableError) {
      return res.status(503).json({ code: 'records_unavailable', message: 'Doctor login is unavailable right now.' });
    }
    next(err);
  }
});

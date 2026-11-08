import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';

process.env.DOCTOR_SESSION_SECRET = randomBytes(32).toString('base64');
const { hashPassword, verifyPassword, passwordProblem, issueDoctorToken, verifyDoctorToken } = await import('./doctorAuth.js');
const { isDoctorUserId, doctorIdFromUserId } = await import('./doctorIds.js');

describe('doctor passwords', () => {
  it('accepts the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery');
    assert.match(stored, /^scrypt\$/);
    assert.equal(await verifyPassword('correct horse battery', stored), true);
    assert.equal(await verifyPassword('wrong password', stored), false);
  });

  it('salts every hash', async () => {
    assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
  });

  it('rejects malformed stored hashes', async () => {
    for (const bad of [null, '', 'plaintext', 'bcrypt$1$2$3$4$5']) assert.equal(await verifyPassword('x', bad), false);
  });

  it('needs at least 10 characters', () => {
    assert.ok(passwordProblem('short'));
    assert.equal(passwordProblem('long enough!'), null);
  });
});

describe('doctor tokens', () => {
  it('round-trips to a doctor user id', async () => {
    const { token, expiresAt } = await issueDoctorToken('demo-dr-rivera');
    assert.ok(Date.parse(expiresAt) > Date.now());
    const userId = await verifyDoctorToken(token);
    assert.equal(userId, 'doctor|demo-dr-rivera');
    assert.equal(isDoctorUserId(userId), true);
    assert.equal(doctorIdFromUserId(userId), 'demo-dr-rivera');
  });

  it('rejects tokens signed with another key', async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('doctor|demo-dr-rivera')
      .setIssuer('patient-priority')
      .setAudience('patient-priority-doctor')
      .setExpirationTime('1h')
      .sign(randomBytes(32));
    await assert.rejects(verifyDoctorToken(forged));
  });

  it('rejects tampered tokens', async () => {
    const { token } = await issueDoctorToken('demo-dr-rivera');
    await assert.rejects(verifyDoctorToken(token.slice(0, -2) + 'xx'));
  });

  it('is accepted by requireUser as a doctor login, and forgeries are not', async () => {
    const { requireUser } = await import('./auth0.js');
    const call = async (authorization) => {
      const req = { headers: { authorization } };
      let status = null;
      let passed = false;
      const res = { status: (s) => ((status = s), res), json: () => res };
      const warn = console.warn;
      console.warn = () => {};
      try {
        await requireUser(req, res, () => (passed = true));
      } finally {
        console.warn = warn;
      }
      return { passed, status, userId: req.userId };
    };
    const { token } = await issueDoctorToken('demo-dr-rivera');
    assert.deepEqual(await call(`Bearer ${token}`), { passed: true, status: null, userId: 'doctor|demo-dr-rivera' });
    assert.equal((await call(`Bearer ${token}x`)).status, 401);
    assert.equal((await call(undefined)).status, 401);
  });

  it('never treats Auth0 ids as doctors', () => {
    assert.equal(isDoctorUserId('auth0|abc123'), false);
    assert.equal(doctorIdFromUserId('google-oauth2|1'), null);
  });
});

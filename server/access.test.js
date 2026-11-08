import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAccess, parseVisitId } from './access.js';
import { DatabaseUnavailableError } from './db.js';

// Fake records: maya owns visit 1, daniel owns visit 2, doc-login is a doctor.
const fakes = {
  getOrCreatePatientId: async (userId) => ({ 'maya-login': 'demo-maya', 'daniel-login': 'demo-daniel' })[userId] ?? 'p_new',
  getDoctorByAuth0Id: async (userId) => (userId === 'doc-login' ? { id: 'demo-dr-rivera', name: 'Dr. Rivera' } : null),
  getVisitPatientId: async (visitId) => ({ 1: 'demo-maya', 2: 'demo-daniel' })[visitId] ?? null,
};
const access = createAccess(fakes);

/** Runs middleware in order. Returns the status sent, or 'next' if every step let it through. */
async function run(steps, req) {
  let sent = null;
  const res = {
    status(code) {
      sent = code;
      return res;
    },
    json() {},
  };
  for (const step of steps) {
    let passed = false;
    let error = null;
    await step(req, res, (err) => {
      error = err ?? null;
      passed = !err;
    });
    if (error) throw error;
    if (!passed) return sent;
  }
  return 'next';
}

describe('requirePatient', () => {
  it('sets the patient id', async () => {
    const req = { userId: 'maya-login' };
    assert.equal(await run([access.requirePatient], req), 'next');
    assert.equal(req.patientId, 'demo-maya');
  });
  it('answers 503 when the database is not set up', async () => {
    const broken = createAccess({ ...fakes, getOrCreatePatientId: async () => Promise.reject(new DatabaseUnavailableError()) });
    assert.equal(await run([broken.requirePatient], { userId: 'x' }), 503);
  });
  it('answers 503 for invalid database configuration without forwarding internal details', async () => {
    const broken = createAccess({ ...fakes, getOrCreatePatientId: async () => { throw new DatabaseUnavailableError('Invalid DATABASE_URL'); } });
    assert.equal(await run([broken.requirePatient], { userId: 'x' }), 503);
  });
});

describe('requireOwnVisit', () => {
  const own = [access.requirePatient, access.requireOwnVisit];
  it('lets a patient open their own visit', async () => {
    const req = { userId: 'maya-login', params: { id: '1' } };
    assert.equal(await run(own, req), 'next');
    assert.equal(req.visitId, 1);
  });
  it("hides another patient's visit as not found", async () => assert.equal(await run(own, { userId: 'maya-login', params: { id: '2' } }), 404));
  it('404s a visit that does not exist', async () => assert.equal(await run(own, { userId: 'maya-login', params: { id: '99' } }), 404));
  it('404s a bad id', async () => assert.equal(await run(own, { userId: 'maya-login', params: { id: '1 OR 1=1' } }), 404));
  it('keeps a new patient out of existing visits', async () => assert.equal(await run(own, { userId: 'stranger', params: { id: '1' } }), 404));
});

describe('requireDoctor', () => {
  it('lets a doctor through', async () => {
    const req = { userId: 'doc-login', params: { id: '2' } };
    assert.equal(await run([access.requireDoctor, access.requireVisit], req), 'next');
    assert.equal(req.doctor.id, 'demo-dr-rivera');
    assert.equal(req.visitId, 2);
  });
  it('blocks a patient with 403', async () => assert.equal(await run([access.requireDoctor], { userId: 'maya-login' }), 403));
  it('404s a missing visit for doctors too', async () =>
    assert.equal(await run([access.requireDoctor, access.requireVisit], { userId: 'doc-login', params: { id: '99' } }), 404));
});

describe('parseVisitId', () => {
  it('accepts whole numbers', () => assert.equal(parseVisitId('42'), 42));
  for (const bad of ['0', '-1', '1.5', 'abc', '', '01', undefined]) {
    it(`rejects ${JSON.stringify(bad)}`, () => assert.equal(parseVisitId(bad), null));
  }
});

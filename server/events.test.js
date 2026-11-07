import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTicketStore, shouldReceive } from './events.js';

describe('tickets', () => {
  it('work once', () => {
    const store = createTicketStore();
    const t = store.issue({ role: 'patient', patientId: 'p1' });
    assert.deepEqual(store.redeem(t), { role: 'patient', patientId: 'p1' });
    assert.equal(store.redeem(t), null);
  });
  it('expire after 30 seconds', () => {
    let now = 0;
    const store = createTicketStore(() => now);
    const t = store.issue({ role: 'doctor', doctorId: 'd' });
    now = 30_001;
    assert.equal(store.redeem(t), null);
  });
  it('reject unknown or missing tickets', () => {
    const store = createTicketStore();
    assert.equal(store.redeem('made-up'), null);
    assert.equal(store.redeem(undefined), null);
    assert.equal(store.redeem(['array']), null);
  });
  it('clear out expired tickets', () => {
    let now = 0;
    const store = createTicketStore(() => now);
    store.issue({});
    now = 31_000;
    store.issue({});
    assert.equal(store.size, 1);
  });
  it('are long and random', () => {
    const store = createTicketStore();
    const a = store.issue({});
    assert.ok(a.length >= 32 && a !== store.issue({}));
  });
});

describe('shouldReceive', () => {
  const maya = { role: 'patient', patientId: 'maya' };
  const doctor = { role: 'doctor', doctorId: 'd' };
  const event = (audience, patientId = 'maya') => ({ visitId: 1, patientId, reason: 'x', audience });

  it('patients get their own events', () => assert.ok(shouldReceive(maya, event('both'))));
  it("patients never get someone else's", () => assert.ok(!shouldReceive(maya, event('both', 'daniel'))));
  it('patients skip doctor-only events', () => assert.ok(!shouldReceive(maya, event('doctors'))));
  it('doctors get doctor and shared events', () => assert.ok(shouldReceive(doctor, event('doctors')) && shouldReceive(doctor, event('both'))));
  it('doctors skip patient-only events', () => assert.ok(!shouldReceive(doctor, event('patient'))));
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAppointmentOffer, parseDoctorReply, parseOrder, parsePrescription } from './doctor.js';

const rx = { medication: 'Ibuprofen', dose: '400 mg', frequency: 'Every 8 hours', duration: '5 days' };

describe('parsePrescription', () => {
  it('defaults instructions to empty', () => assert.equal(parsePrescription(rx).instructions, ''));
  it('requires a dose', () => assert.ok(parsePrescription({ ...rx, dose: '' }).error));
  it('rejects very long fields', () => assert.ok(parsePrescription({ ...rx, medication: 'x'.repeat(201) }).error));
});

describe('parseOrder', () => {
  it('accepts a lab test', () => assert.equal(parseOrder({ type: 'lab', name: 'Throat swab' }).name, 'Throat swab'));
  it('rejects an unknown type', () => assert.ok(parseOrder({ type: 'surgery', name: 'x' }).error));
  it('requires a name', () => assert.ok(parseOrder({ type: 'lab' }).error));
});

describe('parseDoctorReply', () => {
  const body = { message: 'Rest and fluids.', diagnosis: 'Viral sore throat', confirmedCtas: 5 };
  it('accepts a reply with no prescriptions', () => assert.deepEqual(parseDoctorReply(body, 5).prescriptions, []));
  it('takes prescriptions and tests in the same reply', () => {
    const r = parseDoctorReply({ ...body, prescriptions: [rx], orders: [{ type: 'lab', name: 'Throat swab' }] }, 5);
    assert.equal(r.prescriptions[0].medication, 'Ibuprofen');
    assert.equal(r.orders[0].name, 'Throat swab');
  });
  it('requires a message for the patient', () => assert.ok(parseDoctorReply({ ...body, message: ' ' }, 5).error));
  it('requires a diagnosis', () => assert.ok(parseDoctorReply({ ...body, diagnosis: '' }, 5).error));
  it('needs a reason to change the suggested CTAS', () => assert.ok(parseDoctorReply({ ...body, confirmedCtas: 4 }, 5).error));
  it('accepts a change with a reason', () =>
    assert.equal(parseDoctorReply({ ...body, confirmedCtas: 4, ctasOverrideReason: 'Worse than reported' }, 5).ctasOverrideReason, 'Worse than reported'));
  it('sends CTAS 3 to escalate instead', () => assert.ok(parseDoctorReply({ ...body, confirmedCtas: 3, ctasOverrideReason: 'x' }, 5).error));
  it('accepts a reply with no CTAS', () => {
    const reply = parseDoctorReply({ message: 'Rest and fluids.', diagnosis: 'Viral sore throat' }, 5);
    assert.equal(reply.error, undefined);
    assert.equal(reply.confirmedCtas, null);
  });
  it('rejects a bad prescription inside the reply', () => assert.ok(parseDoctorReply({ ...body, prescriptions: [{ medication: 'x' }] }, 5).error));
  it('rejects prescriptions that are not a list', () => assert.ok(parseDoctorReply({ ...body, prescriptions: rx }, 5).error));
});

describe('parseAppointmentOffer', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  const at = (hours) => new Date(now + hours * 3600_000).toISOString();
  const body = { message: 'I would like to see you in person.', location: 'Fast track clinic, room 2', slots: [at(26), at(2)] };

  it('accepts times and sorts them', () => assert.deepEqual(parseAppointmentOffer(body, now).slots, [at(2), at(26)]));
  it('requires a location', () => assert.ok(parseAppointmentOffer({ ...body, location: '' }, now).error));
  it('requires a message', () => assert.ok(parseAppointmentOffer({ ...body, message: '' }, now).error));
  it('makes the description optional', () => assert.equal(parseAppointmentOffer(body, now).description, ''));
  it('keeps a description, trimmed', () => assert.equal(parseAppointmentOffer({ ...body, description: ' Bring your inhaler. ' }, now).description, 'Bring your inhaler.'));
  it('rejects a description over 2000 characters', () => assert.ok(parseAppointmentOffer({ ...body, description: 'x'.repeat(2001) }, now).error));
  it('needs at least one time', () => assert.ok(parseAppointmentOffer({ ...body, slots: [] }, now).error));
  it('allows at most 4 times', () => assert.ok(parseAppointmentOffer({ ...body, slots: [1, 2, 3, 4, 5].map(at) }, now).error));
  it('rejects a time in the past', () => assert.ok(parseAppointmentOffer({ ...body, slots: [at(-1)] }, now).error));
  it('rejects a time under 15 minutes away', () => assert.ok(parseAppointmentOffer({ ...body, slots: [at(0.1)] }, now).error));
  it('rejects a time more than 60 days away', () => assert.ok(parseAppointmentOffer({ ...body, slots: [at(24 * 61)] }, now).error));
  it('rejects the same time twice', () => assert.ok(parseAppointmentOffer({ ...body, slots: [at(3), at(3)] }, now).error));
  it('rejects text that is not a date', () => assert.ok(parseAppointmentOffer({ ...body, slots: ['tomorrow'] }, now).error));
});

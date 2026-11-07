import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNote, parseOrder, parsePrescription, parseQuestion, parseResolve } from './doctor.js';

describe('parseQuestion and parseNote', () => {
  it('trims the text', () => {
    assert.deepEqual(parseQuestion({ text: '  Any fever?  ' }), { text: 'Any fever?' });
    assert.deepEqual(parseNote({ text: 'Check BP next time' }), { text: 'Check BP next time' });
  });
  it('rejects empty, missing, non-string and very long text', () => {
    for (const body of [{ text: '   ' }, {}, null, { text: 42 }, { text: 'x'.repeat(4001) }]) {
      assert.ok(parseQuestion(body).error);
      assert.ok(parseNote(body).error);
    }
  });
});

describe('parsePrescription', () => {
  const rx = { medication: 'Ibuprofen', dose: '400 mg', frequency: 'Every 8 hours', duration: '5 days' };
  it('accepts a full prescription, with instructions optional', () => {
    assert.deepEqual(parsePrescription(rx), { ...rx, instructions: '' });
    assert.equal(parsePrescription({ ...rx, instructions: ' With food. ' }).instructions, 'With food.');
  });
  it('rejects a prescription missing a required field', () => {
    for (const field of Object.keys(rx)) assert.ok(parsePrescription({ ...rx, [field]: '' }).error, field);
  });
});

describe('parseOrder', () => {
  it('accepts the known order types', () => {
    for (const type of ['lab', 'imaging', 'referral', 'other']) {
      assert.deepEqual(parseOrder({ type, name: 'CBC' }), { type, name: 'CBC', instructions: '' });
    }
  });
  it('rejects unknown types and missing names', () => {
    assert.ok(parseOrder({ type: 'surgery', name: 'X' }).error);
    assert.ok(parseOrder({ type: 'lab', name: '' }).error);
  });
});

describe('parseResolve', () => {
  const body = { diagnosis: 'Otitis externa', plan: 'Ear drops for 7 days.', confirmedCtas: 4 };
  it('accepts the AI level unchanged, with no reason needed', () => {
    assert.deepEqual(parseResolve(body, 4), { ...body, ctasOverrideReason: null });
  });
  it('needs a reason when the doctor changes the CTAS level', () => {
    assert.ok(parseResolve({ ...body, confirmedCtas: 5 }, 4).error);
    assert.equal(parseResolve({ ...body, confirmedCtas: 5, ctasOverrideReason: 'Mild' }, 4).ctasOverrideReason, 'Mild');
  });
  it('drops a reason when the level was not changed', () => {
    assert.equal(parseResolve({ ...body, ctasOverrideReason: 'n/a' }, 4).ctasOverrideReason, null);
  });
  it('accepts a level as a string and with no AI suggestion', () => {
    assert.equal(parseResolve({ ...body, confirmedCtas: '2' }, null).confirmedCtas, 2);
  });
  it('rejects bad levels and missing diagnosis or plan', () => {
    for (const confirmedCtas of [0, 6, 2.5, 'x', undefined]) assert.ok(parseResolve({ ...body, confirmedCtas }, 4).error);
    assert.ok(parseResolve({ ...body, diagnosis: '' }, 4).error);
    assert.ok(parseResolve({ ...body, plan: '' }, 4).error);
  });
});

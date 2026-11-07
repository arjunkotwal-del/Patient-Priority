import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOrder, parsePrescription, parseReply, parseResolve } from './doctor.js';

describe('parseReply', () => {
  it('accepts a question', () => assert.deepEqual(parseReply({ kind: 'question', text: ' Any fever? ' }), { kind: 'question', text: 'Any fever?' }));
  it('rejects an unknown kind', () => assert.ok(parseReply({ kind: 'answer', text: 'hi' }).error));
  it('rejects empty text', () => assert.ok(parseReply({ kind: 'plan', text: ' ' }).error));
});

describe('parsePrescription', () => {
  const rx = { medication: 'Ibuprofen', dose: '400 mg', frequency: 'Every 8 hours', duration: '5 days' };
  it('defaults instructions to empty', () => assert.equal(parsePrescription(rx).instructions, ''));
  it('requires a dose', () => assert.ok(parsePrescription({ ...rx, dose: '' }).error));
  it('rejects very long fields', () => assert.ok(parsePrescription({ ...rx, medication: 'x'.repeat(201) }).error));
});

describe('parseOrder', () => {
  it('accepts a lab test', () => assert.equal(parseOrder({ type: 'lab', name: 'Throat swab' }).name, 'Throat swab'));
  it('rejects an unknown type', () => assert.ok(parseOrder({ type: 'surgery', name: 'x' }).error));
  it('requires a name', () => assert.ok(parseOrder({ type: 'lab' }).error));
});

describe('parseResolve', () => {
  const body = { diagnosis: 'Viral sore throat', plan: 'Rest and fluids', confirmedCtas: 5 };
  it('accepts a match with the suggestion', () => assert.equal(parseResolve(body, 5).confirmedCtas, 5));
  it('needs a reason to change the suggested CTAS', () => assert.ok(parseResolve({ ...body, confirmedCtas: 4 }, 5).error));
  it('accepts a change with a reason', () =>
    assert.equal(parseResolve({ ...body, confirmedCtas: 4, ctasOverrideReason: 'Worse than reported' }, 5).ctasOverrideReason, 'Worse than reported'));
  it('sends CTAS 3 to escalate instead', () => assert.ok(parseResolve({ ...body, confirmedCtas: 3, ctasOverrideReason: 'x' }, 5).error));
  it('rejects CTAS as a string', () => assert.ok(parseResolve({ ...body, confirmedCtas: '5' }, 5).error));
  it('requires a diagnosis and plan', () => assert.ok(parseResolve({ confirmedCtas: 5 }, 5).error));
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEMO_PATIENTS } from './history.ts';
import { computePriority, painScore } from './priority.ts';

const base = { complaint: 'sore throat', premadeAnswers: [], transcript: [], history: null };
const run = (extra) => computePriority({ ...base, ...extra });

describe('painScore', () => {
  it('reads the answer to a 1 to 10 question', () => assert.equal(painScore([{ question: 'How bad is the pain from 1 to 10?', answer: '8' }]), 8));
  it('reads a number inside an answer', () => assert.equal(painScore([{ question: 'On a scale of 1-10?', answer: 'Mild (1 to 3)' }]), 1));
  it('ignores other questions', () => assert.equal(painScore([{ question: 'How many days?', answer: '8' }]), null));
});

describe('computePriority', () => {
  it('uses the AI rating when no rule applies', () => assert.equal(run({ aiPriority: 'low' }).priority, 'low'));
  it('defaults to medium without an AI rating', () => assert.equal(run({}).priority, 'medium'));
  it('raises to high for "getting worse"', () => {
    const r = run({ aiPriority: 'low', premadeAnswers: [{ question: 'Better or worse?', answer: 'Getting worse' }] });
    assert.equal(r.priority, 'high');
    assert.ok(r.reasons.includes('Keyword: Getting worse'));
  });
  it('raises to high for a fever', () => assert.equal(run({ aiPriority: 'low', transcript: [{ question: 'Anything else?', answer: 'I have a fever' }] }).priority, 'high'));
  it('ignores "no fever"', () => assert.equal(run({ aiPriority: 'low', transcript: [{ question: 'Fever?', answer: 'No fever' }] }).priority, 'low'));
  it('raises to high for pain 8/10', () => assert.equal(run({ aiPriority: 'low', transcript: [{ question: 'Pain from 1 to 10?', answer: '8' }] }).priority, 'high'));
  it('raises to medium for pain 5/10', () => assert.equal(run({ aiPriority: 'low', transcript: [{ question: 'Pain from 1 to 10?', answer: '5' }] }).priority, 'medium'));
  it('leaves history conditions to the AI', () => assert.equal(run({ aiPriority: 'low', history: DEMO_PATIENTS['demo-maya'] }).priority, 'low'));
  it('never lowers the AI rating', () => assert.equal(run({ aiPriority: 'high', transcript: [{ question: 'Pain from 1 to 10?', answer: '2' }] }).priority, 'high'));
  it('lists the AI reason first', () => assert.equal(run({ aiPriority: 'medium', aiReason: 'Moderate pain' }).reasons[0], 'AI rated medium: Moderate pain'));
});

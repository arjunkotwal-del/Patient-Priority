import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scanForRedFlags } from '../lib/redFlags.ts';
import { parseTriageResult, runSummary } from './summary.js';

const soap = { subjective: 's', assessment: 'a', plan: 'p' };
// What Gemini returns, and what parseTriageResult turns it into.
const minor = { escalate: false, redFlags: [], suggestedCtas: 5, priority: 'low', priorityReason: 'Mild', soap };
const parsedMinor = { escalate: false, redFlags: [], suggestedCtas: 5, aiPriority: 'low', priorityReason: 'Mild', soap };
const parse = (value) => parseTriageResult(JSON.stringify(value));

describe('parseTriageResult', () => {
  it('accepts a minor case', () => assert.deepEqual(parse(minor), parsedMinor));
  it('rejects an unknown priority', () => assert.equal(parse({ ...minor, priority: 'urgent' }), null));
  it('rejects bad JSON', () => assert.equal(parseTriageResult('nope'), null));
  it('rejects a CTAS outside 3 to 5', () => assert.equal(parse({ ...minor, suggestedCtas: 1 }), null));
  it('rejects an empty SOAP field', () => assert.equal(parse({ ...minor, soap: { ...soap, plan: ' ' } }), null));
  it('escalates a CTAS 3', () => assert.equal(parse({ ...minor, suggestedCtas: 3 }).escalate, true));
  it('escalates when red flags are listed', () => {
    const result = parse({ ...minor, redFlags: ['Lip swelling'] });
    assert.equal(result.escalate, true);
    assert.equal(result.suggestedCtas, 3);
  });
});

describe('runSummary', () => {
  const realFetch = globalThis.fetch;
  const input = { complaint: 'sore throat', premadeAnswers: [], transcript: [] };
  let calls;
  const stub = (reply) => {
    globalThis.fetch = async () => {
      calls++;
      if (reply instanceof Error) throw reply;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
    };
  };

  beforeEach(() => {
    calls = 0;
    process.env.GEMINI_API_KEY = 'test';
    process.env.GEMINI_RETRY_BASE_MS = '0';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('returns the SOAP note for a minor case', async () => {
    stub(minor);
    assert.deepEqual(await runSummary(input), {
      flagged: false, redFlags: [], suggestedCtas: 5, priority: 'low', priorityReasons: ['AI rated low: Mild'], soap,
    });
  });
  it('lets a keyword raise the AI priority', async () => {
    stub(minor);
    const result = await runSummary({ ...input, transcript: [{ question: 'Better or worse?', answer: 'getting worse' }] });
    assert.equal(result.priority, 'high');
    assert.ok(result.priorityReasons.includes('Keyword: Getting worse'));
  });
  it('flags a scanner red flag but still writes the summary', async () => {
    stub(minor);
    const result = await runSummary({ ...input, transcript: [{ question: 'Anything else?', answer: 'I have a stiff neck' }] });
    assert.equal(result.flagged, true);
    assert.deepEqual(result.redFlags, ['Stiff neck']);
    assert.equal(result.priority, 'high');
    assert.equal(result.priorityReasons[0], 'Red flag: Stiff neck');
    assert.deepEqual(result.soap, soap);
    assert.equal(calls, 1);
  });
  it('flags the AI red flags as high priority', async () => {
    stub({ ...minor, escalate: true, redFlags: ['Lip swelling'], suggestedCtas: 3 });
    const result = await runSummary(input);
    assert.equal(result.flagged, true);
    assert.equal(result.priority, 'high');
    assert.deepEqual(result.redFlags, ['Lip swelling']);
  });
  it('still sends the case, flagged, if Gemini fails all 3 attempts', async () => {
    stub(new Error('down'));
    const result = await runSummary(input);
    assert.equal(result.flagged, true);
    assert.equal(result.priority, 'high');
    assert.equal(result.soap.subjective, '');
    assert.equal(calls, 3);
  });
});

describe('stiff neck rule', () => {
  it('flags it', () => assert.equal(scanForRedFlags('my neck is stiff').length, 1));
  it('respects negation', () => assert.deepEqual(scanForRedFlags('no stiff neck'), []));
});

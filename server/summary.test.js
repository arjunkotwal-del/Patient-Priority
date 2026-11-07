import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { scanForRedFlags } from '../lib/redFlags.ts';
import { TRIAGE_MESSAGE } from './interview.js';
import { parseTriageResult, runSummary, summaryHandler } from './summary.js';

const soap = { subjective: 's', objective: 'o', assessment: 'a', plan: 'p' };
const minor = { escalate: false, redFlags: [], suggestedCtas: 5, soap };
const parse = (value) => parseTriageResult(JSON.stringify(value));

describe('parseTriageResult', () => {
  it('accepts a minor case', () => assert.deepEqual(parse(minor), minor));
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
    assert.deepEqual(await runSummary(input), minor);
  });
  it('lets the rules win without calling Gemini', async () => {
    stub(minor);
    const result = await runSummary({ ...input, transcript: [{ question: 'Anything else?', answer: 'I have a stiff neck' }] });
    assert.equal(result.escalate, true);
    assert.deepEqual(result.redFlags, ['Stiff neck']);
    assert.equal(calls, 0);
  });
  it('escalates if Gemini fails all 3 attempts', async () => {
    stub(new Error('down'));
    assert.equal((await runSummary(input)).escalate, true);
    assert.equal(calls, 3);
  });
  it('shows an escalated patient only the triage message', async () => {
    let sent;
    await summaryHandler({ body: { complaint: 'I have chest pain' } }, { json: (b) => (sent = b) }, assert.fail);
    assert.deepEqual(sent, { escalate: true, patientMessage: TRIAGE_MESSAGE });
  });
});

describe('stiff neck rule', () => {
  it('flags it', () => assert.equal(scanForRedFlags('my neck is stiff').length, 1));
  it('respects negation', () => assert.deepEqual(scanForRedFlags('no stiff neck'), []));
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { formatHistoryForPrompt, DEMO_PATIENTS } from '../lib/history.ts';
import { getComplaintFlags, scanForRedFlags } from '../lib/redFlags.ts';
import { interviewHandler, MAX_QUESTIONS, parseAiQuestion, runInterviewTurn, TRIAGE_MESSAGE } from './interview.js';

const labels = (text) => scanForRedFlags(text).map((h) => h.label);
const question = { question: 'Where does it hurt?', options: ['Left', 'Right'], allowOther: true, done: false, escalate: false, escalateReason: '' };
const geminiReply = (body) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof body === 'string' ? body : JSON.stringify(body) }] } }] }));

describe('red flag scanner', () => {
  for (const text of [
    'I have chest pain',
    "I can't breathe",
    'no fever but chest pain',
    'no fever and I have chest pain',
    'no fever I have chest pain',
    'not much of a cough then I fainted',
    "I don't have a fever, I can't breathe",
    'No, I have chest pain',
    "I'm not sure if this is chest pain",
    'I have never had chest pain this bad',
    'no idea why but I passed out',
    'my lips are getting puffy',
    'the bleeding won’t stop',
    'I want to kill myself',
  ]) {
    it(`flags: ${text}`, () => assert.notEqual(labels(text).length, 0));
  }
  for (const text of [
    'no chest pain',
    'I do not have chest pain',
    "I don't have any chest pain or shortness of breath",
    'without trouble breathing',
    'denies chest pain',
    'my ankle hurts when I walk',
    'sore throat for 3 days',
  ]) {
    it(`ignores: ${text}`, () => assert.deepEqual(labels(text), []));
  }
});

describe('history and complaint flags', () => {
  it('sends only the last 3 visits', () => {
    const visit = (year) => ({ date: `${year}-01-01`, complaint: `visit ${year}`, summary: 's', plan: 'p' });
    const text = formatHistoryForPrompt({ ...DEMO_PATIENTS['demo-priya'], pastVisits: [2021, 2022, 2023, 2024].map(visit) });
    assert.match(text, /visit 2024/);
    assert.doesNotMatch(text, /visit 2021/);
  });
  it('matches flags to the complaint', () => assert.ok(getComplaintFlags('sore throat').some((f) => f.includes('saliva'))));
});

describe('parseAiQuestion', () => {
  it('rejects bad JSON', () => assert.equal(parseAiQuestion('nope'), null));
  it('rejects an empty question', () => assert.equal(parseAiQuestion(JSON.stringify({ ...question, question: '' })), null));
  it('caps options at 4', () => assert.equal(parseAiQuestion(JSON.stringify({ ...question, options: ['a', 'b', 'c', 'd', 'e'] })).options.length, 4));
  it('turns one option into a typed answer', () => {
    const ai = parseAiQuestion(JSON.stringify({ ...question, options: ['a'], allowOther: false }));
    assert.deepEqual(ai.options, []);
    assert.equal(ai.allowOther, true);
  });
});

describe('runInterviewTurn', () => {
  const realFetch = globalThis.fetch;
  let calls;
  const input = (extra = {}) => ({ complaint: 'sore throat', premadeAnswers: [], transcript: [], ...extra });
  const stub = (...replies) => {
    globalThis.fetch = async () => {
      calls++;
      const reply = replies[Math.min(calls - 1, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return geminiReply(reply);
    };
  };

  beforeEach(() => {
    calls = 0;
    process.env.GEMINI_API_KEY = 'test';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('returns the next question', async () => {
    stub(question);
    assert.equal((await runInterviewTurn(input())).question, question.question);
  });
  it('escalates on a scanner hit without calling Gemini', async () => {
    stub(question);
    const result = await runInterviewTurn(input({ transcript: [{ question: 'Anything else?', answer: 'I fainted' }] }));
    assert.equal(result.escalate, true);
    assert.equal(calls, 0);
  });
  it('retries once after a bad reply', async () => {
    stub('not json', question);
    assert.equal((await runInterviewTurn(input())).question, question.question);
    assert.equal(calls, 2);
  });
  it('escalates if Gemini keeps failing', async () => {
    stub(new Error('down'));
    assert.equal((await runInterviewTurn(input())).escalate, true);
    assert.equal(calls, 2);
  });
  it('stops at the question limit but still lets the AI escalate', async () => {
    const transcript = Array.from({ length: MAX_QUESTIONS }, () => ({ question: 'q', answer: 'a' }));
    stub(question);
    assert.equal((await runInterviewTurn(input({ transcript }))).done, true);
    calls = 0;
    stub({ ...question, question: '', escalate: true, escalateReason: 'not minor' });
    assert.equal((await runInterviewTurn(input({ transcript }))).escalate, true);
  });
  it('hides the staff reason from the patient', async () => {
    let sent;
    await interviewHandler({ body: { complaint: 'I have chest pain' } }, { json: (b) => (sent = b) }, assert.fail);
    assert.equal(sent.escalateReason, '');
    assert.equal(sent.patientMessage, TRIAGE_MESSAGE);
  });
});

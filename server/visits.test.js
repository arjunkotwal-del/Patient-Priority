import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTranscript, parseMessageText } from './visits.js';

const ai = (text) => ({ from: 'ai', kind: 'question', text });
const patient = (text) => ({ from: 'patient', kind: 'answer', text });

describe('buildTranscript', () => {
  it('skips the complaint and pairs questions with answers', () => {
    const messages = [patient('sore throat'), ai('Hard to swallow?'), patient('No'), ai('Fever?'), patient('Yes')];
    assert.deepEqual(buildTranscript(messages), [
      { question: 'Hard to swallow?', answer: 'No' },
      { question: 'Fever?', answer: 'Yes' },
    ]);
  });
  it('leaves out a question that has no answer yet', () => {
    assert.deepEqual(buildTranscript([patient('rash'), ai('Spreading?')]), []);
  });
  it('is empty with only the complaint', () => assert.deepEqual(buildTranscript([patient('rash')]), []));
});

describe('parseMessageText', () => {
  it('trims text', () => assert.equal(parseMessageText({ text: '  hi  ' }), 'hi'));
  for (const body of [{}, { text: '   ' }, { text: 42 }, { text: 'x'.repeat(2001) }, null]) {
    it(`rejects ${JSON.stringify(body)?.slice(0, 30)}`, () => assert.equal(parseMessageText(body), null));
  }
});

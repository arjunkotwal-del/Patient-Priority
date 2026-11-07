import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bodyArea, DEMO_PATIENTS, findRelatedVisits, formatHistoryForPrompt } from './history.ts';

describe('bodyArea', () => {
  const cases = {
    'my throat hurts a lot': 'throat',
    'Sore throat': 'throat',
    'itchy rash on my leg': 'skin',
    'hurt my ankle again playing soccer': 'limb',
    'my left ear hurts': 'ear',
    'my heart is racing': null,
    'it hurts when I pee': 'urinary',
    'I feel unwell': null,
  };
  for (const [text, area] of Object.entries(cases)) it(`${text} -> ${area}`, () => assert.equal(bodyArea(text), area));
});

describe('findRelatedVisits', () => {
  const maya = DEMO_PATIENTS['demo-maya'];
  const daniel = DEMO_PATIENTS['demo-daniel'];
  it('links a sore throat to a past sore throat', () => assert.equal(findRelatedVisits('my throat hurts', maya).length, 1));
  it('does not link a rash to a sore throat', () => assert.equal(findRelatedVisits('itchy rash on my leg', maya).length, 0));
  it('does not link an ear to a sore throat', () => assert.equal(findRelatedVisits('my left ear hurts', maya).length, 0));
  it('links an ankle to a past ankle sprain', () => assert.equal(findRelatedVisits('twisted my ankle', daniel)[0]?.complaint, 'Ankle sprain'));
  it('links a rash on the arm to a past skin rash, not the ankle', () =>
    assert.deepEqual(findRelatedVisits('rash on my arm', daniel).map((v) => v.complaint), ['Skin rash']));
  it('finds nothing without history', () => assert.deepEqual(findRelatedVisits('sore throat', null), []));
});

describe('formatHistoryForPrompt', () => {
  it('can show only chosen visits', () => {
    const text = formatHistoryForPrompt(DEMO_PATIENTS['demo-maya'], []);
    assert.match(text, /Recent visits:\nnone on file/);
    assert.match(text, /penicillin/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatScanHandler } from './chatScan.js';
import { TRIAGE_MESSAGE } from './interview.js';

function send(body) {
  const out = { status: 200 };
  const res = {
    status(code) {
      out.status = code;
      return res;
    },
    json(value) {
      out.body = value;
    },
  };
  chatScanHandler({ body }, res);
  return out;
}

describe('chatScanHandler', () => {
  it('passes a normal reply', () => assert.deepEqual(send({ message: 'It feels a bit better today' }).body, { escalate: false }));
  it('respects negation', () => assert.deepEqual(send({ message: 'no chest pain' }).body, { escalate: false }));
  it('escalates a red flag without showing why', () => {
    assert.deepEqual(send({ message: 'now I have chest pain' }).body, { escalate: true, patientMessage: TRIAGE_MESSAGE });
  });
  it('rejects an empty message', () => assert.equal(send({ message: ' ' }).status, 400));
  it('rejects a missing message', () => assert.equal(send({}).status, 400));
});

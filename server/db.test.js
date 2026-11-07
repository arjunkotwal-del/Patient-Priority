import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { loadHistory } from './db.js';

describe('loadHistory without a database', () => {
  before(() => {
    delete process.env.DATABASE_URL;
  });

  it('falls back to a demo patient', async () => assert.equal(await loadHistory('demo-maya'), DEMO_PATIENTS['demo-maya']));
  it('ignores ids that are not demo ids', async () => assert.equal(await loadHistory('someone-else', undefined), null));
  it('returns null for an unknown user', async () => assert.equal(await loadHistory(undefined, 'auth0|123'), null));
});

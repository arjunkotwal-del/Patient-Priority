import assert from 'node:assert/strict';
import { before, describe, it, afterEach } from 'node:test';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { connectionOptions, DatabaseUnavailableError, loadPatientHistory, toPatientView } from './db.js';

describe('database URL configuration', () => {
  const original = process.env.DATABASE_URL;
  afterEach(() => { if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original; });
  it('rejects a malformed URL without exposing credentials', () => {
    process.env.DATABASE_URL = 'postgresql://user:SECRET_PASSWORD@host:invalid-port/database';
    assert.throws(() => connectionOptions(), (error) => {
      assert.ok(error instanceof DatabaseUnavailableError);
      assert.ok(error.message.includes('Invalid DATABASE_URL'));
      assert.ok(!JSON.stringify(error).includes('SECRET_PASSWORD'));
      assert.ok(!('input' in error));
      return true;
    });
  });
  it('rejects an HTTP address instead of treating it as Postgres', () => {
    process.env.DATABASE_URL = 'https://example.invalid/database';
    assert.throws(() => connectionOptions(), DatabaseUnavailableError);
  });
  it('keeps certificate verification enabled for valid Postgres URLs', () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?sslmode=require';
    const options = connectionOptions();
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.ok(!options.connectionString.includes('sslmode='));
  });
});

describe('loadPatientHistory without a database', () => {
  before(() => {
    delete process.env.DATABASE_URL;
  });

  it('falls back to a demo patient', async () => assert.equal(await loadPatientHistory('demo-maya'), DEMO_PATIENTS['demo-maya']));
  it('returns null for an unknown patient', async () => assert.equal(await loadPatientHistory('p_unknown'), null));
});

describe('toPatientView', () => {
  const visit = {
    id: 1,
    patientId: 'demo-maya',
    status: 'resolved',
    complaint: 'Sore throat',
    startedAt: 'a',
    resolvedAt: 'b',
    doctor: { id: 'dr', name: 'Dr. Demo' },
    assignedDoctor: null,
    diagnosis: 'Viral sore throat',
    summary: 'Clinical summary',
    plan: 'Rest',
    suggestedCtas: 5,
    confirmedCtas: 4,
    ctasOverrideReason: 'Looked worse',
    redFlags: ['Something scary'],
    soap: { subjective: 'SECRET-SOAP', assessment: '', plan: '' },
    messages: [],
    prescriptions: [],
    orders: [],
  };

  it('keeps what the patient needs', () => {
    const view = toPatientView(visit, 2);
    assert.equal(view.doctorName, 'Dr. Demo');
    assert.equal(view.plan, 'Rest');
    assert.equal(view.unreadCount, 2);
  });
  it("includes the patient's own check-in answers", () => {
    const premadeAnswers = [{ question: 'When did it start?', answer: 'Today' }];
    assert.deepEqual(toPatientView({ ...visit, premadeAnswers }).premadeAnswers, premadeAnswers);
    assert.deepEqual(toPatientView(visit).premadeAnswers, []);
  });
  it('drops everything for staff only', () => {
    const text = JSON.stringify(toPatientView(visit));
    for (const hidden of ['SECRET-SOAP', 'Something scary', 'Clinical summary', 'Looked worse', 'suggestedCtas', 'confirmedCtas', 'patientId']) {
      assert.ok(!text.includes(hidden), `${hidden} leaked`);
    }
  });
  it('names the assigned doctor before the case is resolved', () => {
    const view = toPatientView({ ...visit, doctor: null, assignedDoctor: { id: 'dr2', name: 'Dr. Two' } });
    assert.equal(view.doctorName, 'Dr. Two');
  });
});

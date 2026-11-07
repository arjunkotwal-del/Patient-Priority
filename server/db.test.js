import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { DEMO_PATIENTS } from '../lib/history.ts';
import { loadPatientHistory, toPatientView } from './db.js';

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
    soap: { subjective: 'SECRET-SOAP', objective: '', assessment: '', plan: '' },
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

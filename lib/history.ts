import type { PatientHistory } from './types.ts';

const RECENT_VISITS = 3;
const list = (items: string[]) => (items.length ? items.join(', ') : 'none on file');

/** Sends Gemini only allergies, meds, conditions and the last 3 visits. */
export function formatHistoryForPrompt(history: PatientHistory | null | undefined): string {
  if (!history) return 'No history on file. This may be a new patient.';
  const visits = [...history.pastVisits]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, RECENT_VISITS)
    .map((v) => {
      const diagnosis = v.diagnosis ? ` Doctor's diagnosis: ${v.diagnosis}.` : '';
      const prescribed = v.prescriptions?.length ? ` Prescribed: ${v.prescriptions.join(', ')}.` : '';
      return `- ${v.date}: ${v.complaint}. ${v.summary}${diagnosis}${prescribed} Plan: ${v.plan}`;
    });
  return [
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    `Allergies: ${list(history.allergies)}`,
    `Current medications: ${list(history.currentMeds)}`,
    `Conditions: ${list(history.conditions)}`,
    `Recent visits:\n${visits.length ? visits.join('\n') : 'none on file'}`,
  ].join('\n');
}

// Fake returning patients for the demo. Replace with real storage later.
export const DEMO_PATIENTS: Record<string, PatientHistory> = {
  'demo-maya': {
    patientId: 'demo-maya',
    allergies: ['penicillin'],
    currentMeds: ['salbutamol inhaler as needed'],
    conditions: ['mild asthma'],
    pastVisits: [
      { date: '2026-03-14', complaint: 'Sore throat', summary: 'Three days of throat pain, no fever.', plan: 'Fluids and rest; return if worse.' },
    ],
  },
  'demo-daniel': {
    patientId: 'demo-daniel',
    allergies: [],
    currentMeds: ['metformin 500 mg twice daily'],
    conditions: ['type 2 diabetes'],
    pastVisits: [
      { date: '2026-08-02', complaint: 'Ankle sprain', summary: 'Rolled left ankle playing soccer, able to walk.', plan: 'Rest, ice, compression.' },
      { date: '2025-11-20', complaint: 'Skin rash', summary: 'Itchy rash on forearm after gardening.', plan: 'Topical cream.' },
    ],
  },
  'demo-priya': {
    patientId: 'demo-priya',
    allergies: ['sulfa drugs', 'latex'],
    currentMeds: [],
    conditions: [],
    pastVisits: [],
  },
};

import type { PastVisit, PatientHistory } from './types.ts';

const RECENT_VISITS = 3;
const list = (items: string[]) => (items.length ? items.join(', ') : 'none on file');

// Body areas, checked in this order so "rash on my leg" counts as skin, not a limb injury.
const BODY_AREAS: [string, RegExp][] = [
  ['skin', /\b(rash\w*|hives|itch\w*|skin|bite)\b/],
  ['wound', /\b(cut|laceration|wound|burn\w*)\b/],
  ['eye', /\b(eyes?|vision)\b/],
  ['ear', /\b(ears?|earache)\b/],
  ['throat', /\b(throat|tonsils?|swallow\w*)\b/],
  ['urinary', /\b(urin\w*|pee\w*|bladder|uti)\b/],
  ['stomach', /\b(stomach|abdom\w*|belly|vomit\w*|diarrh\w*|nausea)\b/],
  ['head', /\b(head|headaches?|migraines?)\b/],
  ['limb', /\b(ankles?|foot|feet|knees?|legs?|wrists?|arms?|hands?|fingers?|toes?|sprain\w*|shoulders?|elbows?)\b/],
];

/** The body area a complaint is about, or null if it doesn't clearly match one. */
export function bodyArea(text: string): string | null {
  const lower = text.toLowerCase();
  return BODY_AREAS.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
}

/**
 * Past visits about the same body area as today's complaint. Decided in code, not by the
 * AI, because the AI kept linking unrelated visits (a sore throat to a rash).
 */
export function findRelatedVisits(complaint: string, history: PatientHistory | null | undefined): PastVisit[] {
  const area = bodyArea(complaint);
  if (!area || !history) return [];
  return history.pastVisits.filter((v) => bodyArea(v.complaint) === area);
}

/**
 * Sends Gemini only allergies, meds, conditions and the last 3 visits. Pass `visits`
 * to send a chosen set instead, such as only the related ones.
 */
export function formatHistoryForPrompt(history: PatientHistory | null | undefined, visitsToShow?: PastVisit[]): string {
  if (!history) return 'No history on file. This may be a new patient.';
  const visits = [...(visitsToShow ?? history.pastVisits)]
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

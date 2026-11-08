// Queue priority for minor cases (anything serious already went to the triage desk).
// Two layers, like the safety check:
//   1. Keyword rules in code: certain words or a high pain score always mean "high".
//   2. The AI's own rating of high, medium or low, from the whole interview.
// The final priority is whichever is higher. The doctor sees every reason.
// DRAFT CONTENT: a clinician should review these rules before any real use.
import { scanKeywords } from './redFlags.ts';
import type { PatientHistory, QuestionAnswer } from './types.ts';

export type Priority = 'high' | 'medium' | 'low';
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const RANK: Record<Priority, number> = { high: 1, medium: 2, low: 3 };

// Not emergencies, but a doctor should get to these sooner.
const HIGH_PRIORITY_KEYWORDS = [
  { label: 'Getting worse', pattern: /\b(getting|got|gotten|keeps getting|is) worse\b|\bworsening\b|\bspreading\b/ },
  { label: 'Severe pain', pattern: /\b(severe|unbearable|excruciating|terrible|really bad)\b[\w\s]{0,15}\bpain\b|\bpain\b[\w\s]{0,10}\b(severe|unbearable)\b/ },
  { label: 'Fever', pattern: /\bfever\w*|\bhigh temperature\b|\bchills\b/ },
  { label: 'Pregnant', pattern: /\bpregnan\w*/ },
  { label: "Can't eat, drink or sleep", pattern: /\b(can'?t|cannot|unable to) (eat|drink|sleep|keep (food|fluids|anything) down)\b/ },
];

// Conditions in the history are left to the AI: whether asthma matters depends on the
// complaint (yes for a cough, no for a sore ankle), which a keyword rule can't judge.

/** The pain score the patient gave when asked on a 1 to 10 scale, or null. */
export function painScore(transcript: QuestionAnswer[]): number | null {
  for (const { question, answer } of transcript) {
    if (!/\b(1 to 10|1-10|scale|out of 10)\b/i.test(question)) continue;
    const n = Number(/\b(10|[0-9])\b/.exec(answer)?.[1]);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

export interface PriorityInput {
  complaint: string;
  premadeAnswers: QuestionAnswer[];
  transcript: QuestionAnswer[];
  history: PatientHistory | null;
  aiPriority?: Priority | null;
  aiReason?: string;
}

/** Combines the keyword rules and the AI's rating. Returns the higher one, with every reason. */
export function computePriority(input: PriorityInput): { priority: Priority; reasons: string[] } {
  let priority: Priority = input.aiPriority ?? 'medium';
  const reasons: string[] = [];
  if (input.aiPriority) reasons.push(`AI rated ${input.aiPriority}${input.aiReason ? `: ${input.aiReason}` : ''}`);
  const raise = (to: Priority, why: string) => {
    if (RANK[to] < RANK[priority]) priority = to;
    reasons.push(why);
  };

  const patientText = [input.complaint, ...input.premadeAnswers.map((p) => p.answer), ...input.transcript.map((t) => t.answer)];
  const labels = new Set(patientText.flatMap((text) => scanKeywords(text, HIGH_PRIORITY_KEYWORDS)).map((h) => h.label));
  for (const label of labels) raise('high', `Keyword: ${label}`);

  const pain = painScore([...input.premadeAnswers, ...input.transcript]);
  if (pain !== null && pain >= 7) raise('high', `Pain ${pain}/10`);
  else if (pain !== null && pain >= 4) raise('medium', `Pain ${pain}/10`);

  return { priority, reasons };
}

// Turns a finished interview into the doctor's summary note, a suggested CTAS, and the
// queue priority. Used by visits.js.
// Red flags from the rules or the AI flag the case as high priority for the doctor.
import { computePriority, painScore, PRIORITIES } from '../lib/priority.ts';
import { getComplaintFlags } from '../lib/redFlags.ts';
import { buildSummaryPrompt } from '../lib/summaryPrompt.ts';
import { askGemini, conversationText, scanInterview } from './interview.js';

const SOAP_FIELDS = ['subjective', 'assessment', 'plan'];
const EMPTY_SOAP = { subjective: '', assessment: '', plan: '' };

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    escalate: { type: 'BOOLEAN' },
    redFlags: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedCtas: { type: 'INTEGER' },
    priority: { type: 'STRING', enum: PRIORITIES },
    priorityReason: { type: 'STRING' },
    soap: {
      type: 'OBJECT',
      properties: Object.fromEntries(SOAP_FIELDS.map((field) => [field, { type: 'STRING' }])),
      required: SOAP_FIELDS,
    },
  },
  required: ['escalate', 'redFlags', 'suggestedCtas', 'priority', 'priorityReason', 'soap'],
};

/** Checks Gemini's reply. Returns a clean result, or null if it can't be used. */
export function parseTriageResult(raw) {
  let ai;
  try {
    ai = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof ai?.escalate !== 'boolean' || ![3, 4, 5].includes(ai.suggestedCtas) || !Array.isArray(ai.redFlags)) return null;
  if (!SOAP_FIELDS.every((field) => typeof ai.soap?.[field] === 'string' && ai.soap[field].trim())) return null;
  if (!PRIORITIES.includes(ai.priority)) return null;

  const redFlags = ai.redFlags.filter((flag) => typeof flag === 'string' && flag.trim());
  const soap = Object.fromEntries(SOAP_FIELDS.map((field) => [field, ai.soap[field].trim()]));
  // Any sign of a problem counts, even if the AI's fields disagree with each other.
  const escalate = ai.escalate || ai.suggestedCtas === 3 || redFlags.length > 0;
  const priorityReason = typeof ai.priorityReason === 'string' ? ai.priorityReason.trim().slice(0, 300) : '';
  return { escalate, redFlags, suggestedCtas: escalate ? 3 : ai.suggestedCtas, aiPriority: ai.priority, priorityReason, soap };
}

function summaryText(input) {
  const premade = input.premadeAnswers.flatMap((p) => [`Premade question: ${p.question}`, `Patient: ${p.answer}`]);
  return [conversationText(input), ...premade].join('\n');
}

/**
 * Every case goes to the doctor. A red flag (from the scanner or the AI) never stops the case:
 * it puts it at the top of the queue, flagged, and the doctor decides whether to escalate.
 * Returns { flagged, redFlags, suggestedCtas, priority, priorityReasons, painScore, soap }.
 */
export async function runSummary(input) {
  const hits = scanInterview(input);
  const systemPrompt = buildSummaryPrompt({
    complaintFlags: getComplaintFlags(input.complaint),
    history: input.history ?? null,
  });
  const ai = await askGemini(systemPrompt, summaryText(input), RESPONSE_SCHEMA, parseTriageResult);
  // The patient's own 0 to 10 pain score. Breaks ties in the doctor queue. The check-in questions
  // ask it ("How bad is it, on a scale of 1 to 10?"); a later answer in the AI chat wins if there is one.
  const pain = painScore([...(input.transcript ?? []), ...(input.premadeAnswers ?? [])]);

  if (!ai) {
    // No summary: the doctor still gets the full conversation, flagged so they look first.
    const redFlags = [...hits, 'Summary unavailable: AI did not respond'];
    return { flagged: true, redFlags, suggestedCtas: null, priority: 'high', priorityReasons: redFlags.map(flagReason), painScore: pain, soap: EMPTY_SOAP };
  }

  const redFlags = [...new Set([...hits, ...ai.redFlags])];
  const flagged = ai.escalate || redFlags.length > 0;
  // Keyword rules can only raise the AI's priority, never lower it. A red flag always means high.
  const { priority, reasons } = computePriority({ ...input, aiPriority: flagged ? 'high' : ai.aiPriority, aiReason: ai.priorityReason });
  return {
    flagged,
    redFlags,
    suggestedCtas: ai.suggestedCtas,
    priority,
    priorityReasons: [...redFlags.map(flagReason), ...reasons],
    painScore: pain,
    soap: ai.soap,
  };
}

const flagReason = (flag) => `Red flag: ${flag}`;

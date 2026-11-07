// Turns a finished interview into the doctor's summary note, a suggested CTAS, and the
// queue priority. Used by visits.js.
// If the rules or the AI say escalate, we escalate. Rules always win.
import { computePriority, PRIORITIES } from '../lib/priority.ts';
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

const escalated = (redFlags) => ({ escalate: true, redFlags, suggestedCtas: 3, priority: 'high', priorityReasons: [], soap: EMPTY_SOAP });

export async function runSummary(input) {
  const hits = scanInterview(input);
  if (hits.length > 0) return escalated(hits);

  const systemPrompt = buildSummaryPrompt({
    complaintFlags: getComplaintFlags(input.complaint),
    history: input.history ?? null,
  });
  const ai = await askGemini(systemPrompt, summaryText(input), RESPONSE_SCHEMA, parseTriageResult);

  // A case with no summary can't go to the doctor, so a person has to take over.
  if (!ai) return escalated(['Summary unavailable: AI did not respond']);
  if (ai.escalate) return escalated(ai.redFlags);

  // Keyword rules can only raise the AI's priority, never lower it.
  const { priority, reasons } = computePriority({ ...input, aiPriority: ai.aiPriority, aiReason: ai.priorityReason });
  return { escalate: false, redFlags: ai.redFlags, suggestedCtas: ai.suggestedCtas, priority, priorityReasons: reasons, soap: ai.soap };
}

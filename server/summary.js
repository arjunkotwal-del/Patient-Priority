// POST /api/summary: turns a finished interview into a SOAP note and suggested CTAS.
// If the rules or the AI say escalate, we escalate. Rules always win.
import { DEMO_PATIENTS } from '../lib/history.ts';
import { getComplaintFlags } from '../lib/redFlags.ts';
import { buildSummaryPrompt } from '../lib/summaryPrompt.ts';
import { askGemini, conversationText, parseInterviewRequest, scanInterview, TRIAGE_MESSAGE } from './interview.js';

const SOAP_FIELDS = ['subjective', 'objective', 'assessment', 'plan'];
const EMPTY_SOAP = { subjective: '', objective: '', assessment: '', plan: '' };

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    escalate: { type: 'BOOLEAN' },
    redFlags: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedCtas: { type: 'INTEGER' },
    soap: {
      type: 'OBJECT',
      properties: Object.fromEntries(SOAP_FIELDS.map((field) => [field, { type: 'STRING' }])),
      required: SOAP_FIELDS,
    },
  },
  required: ['escalate', 'redFlags', 'suggestedCtas', 'soap'],
};

/** Checks Gemini's reply. Returns a clean TriageResult, or null if it can't be used. */
export function parseTriageResult(raw) {
  let ai;
  try {
    ai = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof ai?.escalate !== 'boolean' || ![3, 4, 5].includes(ai.suggestedCtas) || !Array.isArray(ai.redFlags)) return null;
  if (!SOAP_FIELDS.every((field) => typeof ai.soap?.[field] === 'string' && ai.soap[field].trim())) return null;

  const redFlags = ai.redFlags.filter((flag) => typeof flag === 'string' && flag.trim());
  const soap = Object.fromEntries(SOAP_FIELDS.map((field) => [field, ai.soap[field].trim()]));
  // Any sign of a problem counts, even if the AI's fields disagree with each other.
  const escalate = ai.escalate || ai.suggestedCtas === 3 || redFlags.length > 0;
  return { escalate, redFlags, suggestedCtas: escalate ? 3 : ai.suggestedCtas, soap };
}

function summaryText(input) {
  const premade = input.premadeAnswers.flatMap((p) => [`Premade question: ${p.question}`, `Patient: ${p.answer}`]);
  return [conversationText(input), ...premade].join('\n');
}

export async function runSummary(input) {
  const hits = scanInterview(input);
  if (hits.length > 0) return { escalate: true, redFlags: hits, suggestedCtas: 3, soap: EMPTY_SOAP };

  const systemPrompt = buildSummaryPrompt({
    complaintFlags: getComplaintFlags(input.complaint),
    history: Object.hasOwn(DEMO_PATIENTS, String(input.demoPatientId)) ? DEMO_PATIENTS[input.demoPatientId] : null,
  });
  const result = await askGemini(systemPrompt, summaryText(input), RESPONSE_SCHEMA, parseTriageResult);

  // A case with no summary can't go to the doctor, so a person has to take over.
  return result ?? { escalate: true, redFlags: ['Summary unavailable: AI did not respond'], suggestedCtas: 3, soap: EMPTY_SOAP };
}

/** Express handler. An escalated patient only ever sees the triage message. */
export async function summaryHandler(req, res, next) {
  try {
    const input = parseInterviewRequest(req.body);
    if (!input) return res.status(400).json({ code: 'bad_request', message: 'The interview data was not valid.' });

    const result = await runSummary(input);
    // TODO(storage): save the full result on the case so the doctor or triage staff can see it.
    if (result.escalate) return res.json({ escalate: true, patientMessage: TRIAGE_MESSAGE });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

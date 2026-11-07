// POST /api/interview: returns the next intake question for a patient.
// The route is stateless: the client sends the whole interview on every call,
// so the red flag scanner re-checks every patient message each time.
import { loadHistory } from './db.js';
import { buildInterviewPrompt } from '../lib/interviewPrompt.ts';
import { getComplaintFlags, scanForRedFlags } from '../lib/redFlags.ts';

export const MAX_QUESTIONS = 8;
export const TRIAGE_MESSAGE = 'Please go to the triage desk now.';

const MAX_TEXT = 2000;
const MAX_ITEMS = 30;
const GEMINI_ATTEMPTS = 3;
const GEMINI_TIMEOUT_MS = 15000;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    allowOther: { type: 'BOOLEAN' },
    done: { type: 'BOOLEAN' },
    escalate: { type: 'BOOLEAN' },
    escalateReason: { type: 'STRING' },
  },
  required: ['question', 'options', 'allowOther', 'done', 'escalate', 'escalateReason'],
};

function emptyResult() {
  return { question: '', options: [], allowOther: false, done: false, escalate: false, escalateReason: '' };
}

function parseQaList(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  const items = value.map((item) => ({
    question: typeof item?.question === 'string' ? item.question.trim() : '',
    answer: typeof item?.answer === 'string' ? item.answer.trim() : '',
  }));
  const valid = items.every((i) => i.question && i.answer && i.question.length <= MAX_TEXT && i.answer.length <= MAX_TEXT);
  return valid ? items : null;
}

/** Returns { complaint, premadeAnswers, transcript, demoPatientId }, or null if the body is invalid. */
export function parseInterviewRequest(body) {
  const complaint = typeof body?.complaint === 'string' ? body.complaint.trim() : '';
  const premadeAnswers = parseQaList(body?.premadeAnswers);
  const transcript = parseQaList(body?.transcript);
  if (!complaint || complaint.length > MAX_TEXT || !premadeAnswers || !transcript) return null;
  return { complaint, premadeAnswers, transcript, demoPatientId: body?.demoPatientId };
}

/** Checks Gemini's reply. Returns a clean AiQuestion, or null if it can't be used. */
export function parseAiQuestion(raw) {
  let ai;
  try {
    ai = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof ai?.escalate !== 'boolean' || typeof ai?.done !== 'boolean') return null;
  if (ai.escalate) return { ...emptyResult(), escalate: true, escalateReason: String(ai.escalateReason ?? '') };
  if (ai.done) return { ...emptyResult(), done: true };

  const question = typeof ai.question === 'string' ? ai.question.trim() : '';
  if (!question || !Array.isArray(ai.options)) return null;
  const options = ai.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim()).slice(0, 4);
  // A single option isn't a choice, so make it a typed answer instead.
  const usable = options.length >= 2 ? options : [];
  return { ...emptyResult(), question, options: usable, allowOther: usable.length === 0 || ai.allowOther === true };
}

export function conversationText({ complaint, transcript }, finalTurn = false) {
  const lines = [`Patient's description: ${complaint}`];
  for (const { question, answer } of transcript) lines.push(`Interviewer: ${question}`, `Patient: ${answer}`);
  if (finalTurn) lines.push('The question limit has been reached. Do not ask anything else: set done or escalate to true.');
  return lines.join('\n');
}

async function callGemini(systemPrompt, userText, responseSchema) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing env var GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema },
    }),
  });
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

/**
 * Calls Gemini, retrying with a growing wait (1.5s, then 3s). The free tier often answers
 * 429 (rate limit) or 503 (overloaded) for a moment, and an instant retry just fails again.
 * Returns parse(reply), or null if every attempt failed.
 */
export async function askGemini(systemPrompt, userText, responseSchema, parse) {
  const baseDelay = Number(process.env.GEMINI_RETRY_BASE_MS ?? 1500);
  for (let attempt = 1; attempt <= GEMINI_ATTEMPTS; attempt++) {
    if (attempt > 1 && baseDelay > 0) await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 2)));
    try {
      const result = parse(await callGemini(systemPrompt, userText, responseSchema));
      if (result) return result;
      console.warn(`Interview: unusable Gemini reply (attempt ${attempt})`);
    } catch (err) {
      console.warn(`Interview: ${err.message} (attempt ${attempt})`);
    }
  }
  return null;
}

/** Scans everything the patient has said. Returns the unique red flag labels. */
export function scanInterview({ complaint, premadeAnswers, transcript }) {
  const patientText = [complaint, ...premadeAnswers.map((p) => p.answer), ...transcript.map((t) => t.answer)];
  return [...new Set(patientText.flatMap((text) => scanForRedFlags(text)).map((hit) => hit.label))];
}

/** Runs one interview turn. escalateReason is for staff and must never reach the patient. */
export async function runInterviewTurn(input) {
  const { complaint, premadeAnswers, transcript, history = null } = input;

  // The scanner runs first, so a scary message never depends on the AI.
  const hits = scanInterview(input);
  if (hits.length > 0) {
    return { ...emptyResult(), escalate: true, escalateReason: `Red flag scanner: ${hits.join(', ')}` };
  }

  const finalTurn = transcript.length >= MAX_QUESTIONS;
  const systemPrompt = buildInterviewPrompt({
    maxQuestions: MAX_QUESTIONS,
    complaintFlags: getComplaintFlags(complaint),
    history,
    premadeAnswers,
  });
  const ai = await askGemini(systemPrompt, conversationText(input, finalTurn), RESPONSE_SCHEMA, parseAiQuestion);

  // Without the AI nobody is checking for red flags, so a person has to take over.
  if (!ai) return { ...emptyResult(), escalate: true, escalateReason: 'Interview unavailable: AI did not respond' };
  if (ai.escalate) return { ...ai, escalateReason: ai.escalateReason || 'AI escalated without a reason' };
  if (finalTurn) return { ...emptyResult(), done: true };
  return ai;
}

/** Express handler. Staff-only escalation reasons are removed before the reply. */
export async function interviewHandler(req, res, next) {
  try {
    const input = parseInterviewRequest(req.body);
    if (!input) return res.status(400).json({ code: 'bad_request', message: 'The interview data was not valid.' });

    const history = await loadHistory(input.demoPatientId, req.userId);
    const result = await runInterviewTurn({ ...input, history });
    if (!result.escalate) return res.json(result);

    // TODO(storage): save result.escalateReason on the case so staff can see it.
    res.json({ ...result, escalateReason: '', patientMessage: TRIAGE_MESSAGE });
  } catch (err) {
    next(err);
  }
}

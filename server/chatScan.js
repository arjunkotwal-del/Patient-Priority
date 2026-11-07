// POST /api/chat/scan: checks a patient's reply in the doctor chat for red flags.
// The chat UI calls this before sending the reply to the doctor.
import { scanForRedFlags } from '../lib/redFlags.ts';
import { TRIAGE_MESSAGE } from './interview.js';

const MAX_TEXT = 2000;

export function chatScanHandler(req, res) {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > MAX_TEXT) {
    return res.status(400).json({ code: 'bad_request', message: 'The message was not valid.' });
  }

  const hits = scanForRedFlags(message);
  if (hits.length === 0) return res.json({ escalate: false });

  // TODO(storage): set the case to escalated and save the red flag labels for staff.
  res.json({ escalate: true, patientMessage: TRIAGE_MESSAGE });
}

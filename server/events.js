// Live updates with Server-Sent Events.
//
// The browser's EventSource can't send a login token, so it works in two steps:
//   1. POST /api/events/ticket { as: "patient" | "doctor" }   (logged in) -> { ticket }
//   2. GET  /api/events?ticket=...                              -> the live stream
// A ticket works once and expires after 30 seconds, so the login token never goes in a URL.
//
// Events carry only { visitId, reason }, never health details. The page refetches
// what it needs through the normal, access-checked routes.
//
// Limit: the event bus lives in this server's memory. With more than one server,
// switch to Postgres LISTEN/NOTIFY.
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import express from 'express';
import * as db from './db.js';
import { isDoctorUserId } from './doctorIds.js';

const TICKET_TTL_MS = 30_000;
const HEARTBEAT_MS = 25_000;
const MAX_STREAMS = 500;

// ---- Tickets ----

export function createTicketStore(now = Date.now) {
  const tickets = new Map();
  const sweep = () => {
    for (const [t, entry] of tickets) if (entry.expires <= now()) tickets.delete(t);
  };
  return {
    issue(identity) {
      sweep();
      const ticket = randomBytes(24).toString('base64url');
      tickets.set(ticket, { identity, expires: now() + TICKET_TTL_MS });
      return ticket;
    },
    /** Returns the identity once, or null if unknown, used or expired. */
    redeem(ticket) {
      const entry = typeof ticket === 'string' ? tickets.get(ticket) : undefined;
      if (entry) tickets.delete(ticket);
      return entry && entry.expires > now() ? entry.identity : null;
    },
    get size() {
      return tickets.size;
    },
  };
}

const tickets = createTicketStore();

// ---- Event bus ----

const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * Who gets an event. audience is "patient" (only that patient), "doctors" (every
 * doctor stream) or "both".
 */
export function shouldReceive(identity, event) {
  if (identity.role === 'doctor') return event.audience !== 'patient';
  return event.audience !== 'doctors' && event.patientId === identity.patientId;
}

export function publish(event) {
  bus.emit('visit', event);
}

/**
 * Announces that a visit changed. Never throws: a failed live update must not
 * fail the request that caused it, since the page also refetches on load.
 */
export async function notifyVisit(visitId, reason, audience = 'both') {
  try {
    const patientId = await db.getVisitPatientId(visitId);
    if (patientId) publish({ visitId, patientId, reason, audience });
  } catch (err) {
    console.warn('Live update failed:', err.message);
  }
}

// ---- Routes ----

let openStreams = 0;

/** GET /api/events?ticket=... Mounted before the login check, since the ticket is the login. */
export function eventStreamHandler(req, res) {
  const identity = tickets.redeem(req.query.ticket);
  if (!identity) return res.status(401).json({ code: 'bad_ticket', message: 'Get a new ticket and reconnect.' });
  if (openStreams >= MAX_STREAMS) return res.status(503).json({ code: 'busy', message: 'Too many live connections. Try again soon.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\nevent: ready\ndata: {}\n\n');
  openStreams++;

  const onVisit = (event) => {
    if (shouldReceive(identity, event)) res.write(`event: visit\ndata: ${JSON.stringify({ visitId: event.visitId, reason: event.reason })}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  bus.on('visit', onVisit);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('visit', onVisit);
    openStreams--;
  });
}

export const eventsRouter = express.Router();

eventsRouter.post('/events/ticket', express.json({ limit: '1kb' }), async (req, res, next) => {
  try {
    if (req.body?.as === 'doctor') {
      const doctor = await db.getDoctorForUser(req.userId);
      if (!doctor) return res.status(403).json({ code: 'forbidden', message: 'Only doctors can do this.' });
      return res.json({ ticket: tickets.issue({ role: 'doctor', doctorId: doctor.id }), expiresIn: TICKET_TTL_MS / 1000 });
    }
    if (isDoctorUserId(req.userId)) return res.status(403).json({ code: 'forbidden', message: 'Doctor accounts have no patient updates.' });
    const patientId = await db.getOrCreatePatientId(req.userId);
    res.json({ ticket: tickets.issue({ role: 'patient', patientId }), expiresIn: TICKET_TTL_MS / 1000 });
  } catch (err) {
    if (err instanceof db.DatabaseUnavailableError) return res.status(503).json({ code: 'records_unavailable', message: 'Live updates are unavailable.' });
    next(err);
  }
});

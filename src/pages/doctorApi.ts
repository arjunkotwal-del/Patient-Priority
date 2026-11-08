import type { DoctorNote, PatientHistory, QueueItem, VisitRecord } from '../../lib/types.ts';

/** GET /api/doctor/visits/:id (see docs/API.md). Opening it also marks it read for the doctor. */
export interface DoctorVisitDetail {
  visit: VisitRecord;
  notes: DoctorNote[];
  history: PatientHistory | null;
}

export type { QueueItem };

/** GET /api/doctor/appointments */
export interface AppointmentItem {
  visitId: number;
  patientId: string;
  complaint: string;
  status: 'offered' | 'booked';
  location: string;
  doctorName: string;
  /** The booked time, or the earliest offered time while the patient hasn't picked yet. */
  time: string | null;
}

/** GET /api/doctor/history */
export interface HistoryItem {
  visitId: number;
  patientId: string;
  complaint: string;
  status: 'resolved' | 'appointment_offered' | 'appointment_booked';
  diagnosis: string | null;
  priority: QueueItem['priority'] | null;
  ctas: number | null;
  startedAt: string;
  closedAt: string;
  doctorName: string | null;
}

/** Asks the doctor to confirm, then deletes a past case for good. Returns false if they cancelled. */
export async function deleteHistoryCase(getToken: () => Promise<string>, visitId: number): Promise<boolean> {
  const sure = window.confirm(
    `Delete case #${visitId}? Its chat, advice, prescriptions, tests and any meeting are removed for you and the patient. This can't be undone.`,
  );
  if (!sure) return false;
  await callApi(getToken, `/doctor/visits/${visitId}/delete`, {});
  return true;
}

/** How each closed case ended, for the History page. */
export const OUTCOME_LABELS: Record<HistoryItem['status'], string> = {
  resolved: 'Advice sent',
  appointment_offered: 'Meeting offered',
  appointment_booked: 'Meeting booked',
};

/** Calls one of our /api routes with the user's token. Throws the server's message on failure. */
export async function callApi<T>(getToken: () => Promise<string>, path: string, body?: object): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const reply = await res.json().catch(() => null);
  if (!res.ok) throw new Error(reply?.message ?? `Server error (${res.status})`);
  return reply as T;
}

export const STATUS_LABELS: Record<string, string> = {
  interviewing: 'Patient still answering the AI',
  waiting_for_doctor: 'Waiting for a doctor',
  appointment_offered: 'Appointment times offered',
  appointment_booked: 'Appointment booked',
  resolved: 'Resolved',
  escalated: 'Sent to triage desk',
};

/** Queue priority (see lib/priority.ts). Sorts the queue before CTAS does. */
export const PRIORITY_LABELS: Record<QueueItem['priority'], string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

/** Canadian Triage and Acuity Scale: 1 is most urgent. */
export const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less urgent',
  5: 'Non-urgent',
};

export function formatWait(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const formatTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');

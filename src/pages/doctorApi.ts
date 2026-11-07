import type { DoctorNote, PastVisit, QueueItem, VisitRecord } from '../../lib/types.ts';

export interface DoctorVisitDetail {
  visit: VisitRecord;
  patient: {
    id: string;
    /** Verified name from the health card, if the patient has one on file. */
    name: string | null;
    allergies: string[];
    currentMeds: string[];
    conditions: string[];
    pastVisits: PastVisit[];
  };
  notes: DoctorNote[];
  unreadForDoctor: number;
}

export type { QueueItem };

/** Calls one of our /api routes with the user's token. Throws the server's message on failure. */
export async function callApi<T>(getToken: () => Promise<string>, path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const res = await fetch(`/api${path}`, { method, headers: { Authorization: `Bearer ${await getToken()}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Server error (${res.status})`);
  return body as T;
}

/** Canadian Triage and Acuity Scale: 1 is most urgent. */
export const CTAS_LABELS: Record<number, string> = {
  1: 'Resuscitation',
  2: 'Emergent',
  3: 'Urgent',
  4: 'Less urgent',
  5: 'Non-urgent',
};

export const STATUS_LABELS: Record<string, string> = {
  interviewing: 'Patient still answering',
  waiting_for_doctor: 'Waiting for a doctor',
  doctor_asked: 'Waiting on patient reply',
  resolved: 'Resolved',
  escalated: 'Sent to triage desk',
};

export function formatWait(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

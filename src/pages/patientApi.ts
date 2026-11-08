import type { CaseStatus, PatientVisitView } from '../../lib/types.ts';

export { callApi } from './doctorApi';
export type { PatientVisitView };

/** One answer the server can give after the patient sends something (see docs/API.md). */
export type StepResponse =
  | { visitId: number; status: 'interviewing'; question: { text: string; options: string[]; allowOther: boolean } }
  | { visitId: number; status: 'waiting_for_doctor' | 'escalated'; patientMessage: string };

/** GET /api/me/visits */
export interface MyVisits {
  visits: {
    id: number;
    complaint: string;
    status: CaseStatus;
    startedAt: string;
    resolvedAt: string | null;
    doctorName: string | null;
    unreadCount: number;
  }[];
  unreadTotal: number;
}

export type VisitSummary = MyVisits['visits'][number];

/** Visits that are still going. Everything else is history. */
/** Still going: everything except a finished or escalated visit. */
export const isActiveVisit = (status: CaseStatus) => status !== 'resolved' && status !== 'escalated';

export const OPEN_STATUSES: CaseStatus[] = ['interviewing', 'waiting_for_doctor', 'appointment_offered', 'appointment_booked'];

/** What the patient sees for each status. Never anything about priority or triage level. */
export const PATIENT_STATUS: Record<CaseStatus, string> = {
  interviewing: 'Answering questions',
  waiting_for_doctor: 'Pending',
  appointment_offered: 'Pick a time',
  appointment_booked: 'Booked',
  resolved: 'Plan ready',
  escalated: 'Check notifications',
};

/**
 * The status to show the patient. A visit no doctor has answered is "Pending", including old
 * visits that were closed automatically with no doctor on them.
 */
export function patientStatus(status: CaseStatus, doctorName: string | null): { key: CaseStatus; label: string } {
  if (status === 'escalated' && !doctorName) return { key: 'waiting_for_doctor', label: PATIENT_STATUS.waiting_for_doctor };
  return { key: status, label: PATIENT_STATUS[status] };
}

/** Times come from the server in UTC; show them in the patient's own time zone. */
export const formatSlot = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatClock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

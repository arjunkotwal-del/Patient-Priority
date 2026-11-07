export interface PastVisit {
  date: string;
  complaint: string;
  summary: string;
  plan: string;
  diagnosis?: string | null;
  doctorName?: string | null;
  /** Short labels such as "Ibuprofen 400 mg". */
  prescriptions?: string[];
}

export interface PatientHistory {
  patientId: string;
  allergies: string[];
  currentMeds: string[];
  conditions: string[];
  pastVisits: PastVisit[];
}

export interface AiQuestion {
  question: string;
  options: string[];
  allowOther: boolean;
  done: boolean;
  escalate: boolean;
  escalateReason: string;
}

export interface TriageResult {
  escalate: boolean;
  redFlags: string[];
  suggestedCtas: 3 | 4 | 5;
  soap: { subjective: string; objective: string; assessment: string; plan: string };
}

export interface Message {
  /** "ai" is the intake interviewer. */
  from: 'patient' | 'ai' | 'doctor';
  text: string;
  kind: 'question' | 'answer' | 'plan';
  /** ISO timestamp, set by the database. */
  sentAt?: string;
}

export type CaseStatus = 'interviewing' | 'waiting_for_doctor' | 'doctor_asked' | 'resolved' | 'escalated';

export interface Prescription {
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
  prescribedAt: string;
  doctorName: string;
}

/** A test, imaging study or referral ordered by the doctor. */
export interface Order {
  type: 'lab' | 'imaging' | 'referral' | 'other';
  name: string;
  instructions: string;
  orderedAt: string;
  doctorName: string;
}

/** One case in the doctor queue. */
export interface QueueItem {
  visitId: number;
  patientId: string;
  complaint: string;
  status: 'waiting_for_doctor' | 'doctor_asked';
  suggestedCtas: number | null;
  startedAt: string;
  waitingMinutes: number;
  assignedDoctor: { id: string; name: string } | null;
  unreadForDoctor: number;
}

/** What a patient may see about their own visit. No SOAP note, red flags, CTAS or doctor notes. */
export interface PatientVisitView {
  id: number;
  status: CaseStatus;
  complaint: string;
  startedAt: string;
  resolvedAt: string | null;
  doctorName: string | null;
  diagnosis: string | null;
  plan: string | null;
  messages: Message[];
  prescriptions: Prescription[];
  orders: Order[];
  unreadCount: number;
}

/** A private note for doctors only. Never send these to the patient or the AI. */
export interface DoctorNote {
  text: string;
  writtenAt: string;
  doctorName: string;
}

/** Everything about one visit: the full chat, the doctor, the diagnosis and prescriptions. Excludes doctor notes. */
export interface VisitRecord {
  id: number;
  patientId: string;
  status: CaseStatus;
  complaint: string;
  startedAt: string;
  resolvedAt: string | null;
  doctor: { id: string; name: string } | null;
  assignedDoctor: { id: string; name: string } | null;
  diagnosis: string | null;
  summary: string | null;
  plan: string | null;
  suggestedCtas: number | null;
  confirmedCtas: number | null;
  ctasOverrideReason: string | null;
  redFlags: string[];
  soap: TriageResult['soap'] | null;
  messages: Message[];
  prescriptions: Prescription[];
  orders: Order[];
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

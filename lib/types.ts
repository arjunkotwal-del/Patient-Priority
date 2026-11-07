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

/** Everything about one visit: the full chat, the doctor, the diagnosis and prescriptions. */
export interface VisitRecord {
  id: number;
  patientId: string;
  status: CaseStatus;
  complaint: string;
  startedAt: string;
  resolvedAt: string | null;
  doctor: { id: string; name: string } | null;
  diagnosis: string | null;
  summary: string | null;
  plan: string | null;
  suggestedCtas: number | null;
  confirmedCtas: number | null;
  redFlags: string[];
  soap: TriageResult['soap'] | null;
  messages: Message[];
  prescriptions: Prescription[];
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

export interface PastVisit {
  date: string;
  complaint: string;
  summary: string;
  plan: string;
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
  from: 'patient' | 'doctor';
  text: string;
  kind: 'question' | 'answer' | 'plan';
}

export type CaseStatus = 'interviewing' | 'waiting_for_doctor' | 'doctor_asked' | 'resolved' | 'escalated';

export interface QuestionAnswer {
  question: string;
  answer: string;
}

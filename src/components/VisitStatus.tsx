import type { CaseStatus } from '../../lib/types';
import { PATIENT_STATUS } from '../pages/patientApi';
export function VisitStatus({ status }: { status: CaseStatus }) {
  return (
    <span className={`visit-status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {PATIENT_STATUS[status]}
    </span>
  );
}

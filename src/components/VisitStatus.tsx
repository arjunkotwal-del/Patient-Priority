import type { CaseStatus } from '../../lib/types';
import { patientStatus } from '../pages/patientApi';

/** The visit's status chip. Anything a doctor hasn't answered yet reads "Pending". */
export function VisitStatus({ status, doctorName = null }: { status: CaseStatus; doctorName?: string | null }) {
  const shown = patientStatus(status, doctorName);
  return (
    <span className={`visit-status status-${shown.key}`}>
      <span className="status-dot" aria-hidden="true" />
      {shown.label}
    </span>
  );
}

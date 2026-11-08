import { Link } from 'react-router-dom';
import { VisitList, useMyVisits } from './VisitsPage';

/** Care plans: every visit the doctor has answered, newest first. Each opens to its plan. */
export function CarePlanPage() {
  const { data, error } = useMyVisits();
  const plans = data?.visits.filter((v) => v.status === 'resolved' || v.status === 'appointment_booked') ?? [];

  return (
    <div className="sc-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">From your doctors</span>
          <h1>Care plan</h1>
        </div>
      </div>
      <p className="muted">Diagnoses, prescriptions, tests and booked appointments from your doctors.</p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && plans.length === 0 && (
        <div className="empty">No care plans yet. <Link to="/visits">Start a visit in the main chat</Link></div>
      )}
      {plans.length > 0 && (
        <section className="card">
          <VisitList visits={plans} />
        </section>
      )}
    </div>
  );
}

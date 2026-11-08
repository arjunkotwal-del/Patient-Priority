import { Link } from 'react-router-dom';
import { OPEN_STATUSES } from './patientApi';
import { VisitList, useMyVisits } from './VisitsPage';

/** Past visits: each one opens to the doctor's plan, prescriptions and tests. */
export function HistoryPage() {
  const { data, error } = useMyVisits();
  const past = data?.visits.filter((v) => !OPEN_STATUSES.includes(v.status)) ?? [];

  return (
    <div className="sc-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Your records</span>
          <h1>My medical history</h1>
        </div>
        <span className="mono faint">{data ? `${past.length} past visit${past.length === 1 ? '' : 's'}` : ''}</span>
      </div>
      <p className="muted">Every past visit, with the doctor's reply, prescriptions and tests.</p>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && past.length === 0 && (
        <div className="empty">
          No past visits yet. <Link to="/visits">Start one in the main chat</Link>
        </div>
      )}
      {past.length > 0 && (
        <section className="card">
          <VisitList visits={past} />
        </section>
      )}
    </div>
  );
}

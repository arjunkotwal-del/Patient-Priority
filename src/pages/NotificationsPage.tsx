import { VisitList, useMyVisits } from './VisitsPage';

/** Doctor notifications: visits with something new from a doctor, or waiting on the patient. */
export function NotificationsPage() {
  const { data, error } = useMyVisits();
  const updates = data?.visits.filter((v) => v.unreadCount > 0 || v.status === 'appointment_offered') ?? [];

  return (
    <div className="sc-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Updates live</span>
          <h1>Doctor notifications</h1>
        </div>
      </div>
      <p className="muted">New replies from your doctors, and appointment times waiting for you to pick.</p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && updates.length === 0 && <div className="empty">You're all caught up.</div>}
      {updates.length > 0 && (
        <section className="card">
          <VisitList visits={updates} />
        </section>
      )}
    </div>
  );
}

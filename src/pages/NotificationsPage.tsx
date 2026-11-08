import { Link } from 'react-router-dom';
import { usePatientVisits } from '../components/PatientVisitsContext';
import { Icon } from '../components/LineIcon';
import { VisitStatus } from '../components/VisitStatus';
import { formatTime } from './doctorApi';
import type { VisitSummary } from './patientApi';

/** What each update asks of the patient. */
function updateText(v: VisitSummary) {
  if (v.status === 'appointment_offered') return 'Your doctor offered appointment times. Pick one.';
  if (v.status === 'escalated') return 'Your doctor has an update for you.';
  if (v.status === 'resolved') return 'Your doctor replied with your care plan.';
  return 'There is a new message on this visit.';
}

/** Doctor notifications: unread replies and anything waiting on the patient. */
export function NotificationsPage() {
  const { visits, unreadTotal, error, refresh } = usePatientVisits();
  // Only things a doctor actually did: an unread reply, offered times, or a doctor escalating the
  // visit. Old visits closed automatically (no doctor on them) are not doctor updates.
  const updates = (visits ?? []).filter(
    (v) => v.unreadCount > 0 || v.status === 'appointment_offered' || (v.status === 'escalated' && v.doctorName),
  );

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CARE UPDATES</p>
          <h1>Notifications</h1>
          <p className="muted">Replies from your doctors, and anything waiting for you.</p>
        </div>
      </div>
      <section className="surface-panel">
        <div className="panel-heading">
          <div>
            <h2>Updates</h2>
            <p className="muted small">{visits ? `${unreadTotal} unread` : 'Checking for updates…'}</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void refresh()}>Refresh</button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}{' '}
            <button className="link-btn" onClick={() => void refresh()}>Try again</button>
          </div>
        )}
        {!visits && !error && <p className="loading-state" role="status">Loading your updates…</p>}
        {visits && updates.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon"><Icon name="bell" /></span>
            <h3>You're all caught up</h3>
            <p>When a doctor replies or offers an appointment, it will show up here.</p>
          </div>
        )}
        <ul className="visit-list">
          {updates.map((visit) => (
            <li key={visit.id}>
              <Link to={`/visits/${visit.id}`} className="visit-row">
                <span className="visit-row-icon"><Icon name="bell" /></span>
                <div className="visit-row-main">
                  <div className="visit-row-title">
                    <h3>{visit.complaint}</h3>
                    {visit.unreadCount > 0 && <span className="badge">{visit.unreadCount} new</span>}
                  </div>
                  <p>{updateText(visit)}</p>
                  <p>{formatTime(visit.startedAt)}{visit.doctorName && ` · ${visit.doctorName}`}</p>
                  <VisitStatus status={visit.status} />
                </div>
                <Icon name="arrow" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

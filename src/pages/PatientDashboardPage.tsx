import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePatientVisits } from '../components/PatientVisitsContext';
import { Icon } from '../components/LineIcon';
import { VisitStatus } from '../components/VisitStatus';
import { askNotificationPermission } from '../lib/live';
import { isActiveVisit } from './patientApi';
import { formatTime } from './doctorApi';

export function PatientDashboardPage({ history = false }: { history?: boolean }) {
  const { user, verification } = useAuth();
  const { visits, unreadTotal, error, refresh } = usePatientVisits();
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [search, setSearch] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const active = (visits ?? []).filter((v) => isActiveVisit(v.status));
  const appointments = (visits ?? []).filter(
    (v) => v.status === 'appointment_offered' || v.status === 'appointment_booked',
  );
  const shown = (visits ?? []).filter(
    (v) =>
      (filter === 'all' || (filter === 'active' ? isActiveVisit(v.status) : v.status === 'resolved')) &&
      v.complaint.toLowerCase().includes(search.toLowerCase()),
  );
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR HEALTH WORKSPACE</p>
          <h1>{history ? 'My visits' : `Welcome, ${firstName}.`}</h1>
          <p className="muted">
            {history
              ? 'Your conversations, care plans, and next steps.'
              : 'Keep track of your visits and hear from your care team.'}
          </p>
        </div>
        <Link to="/visits" className="btn">
          <Icon name="plus" />
          Start a visit
        </Link>
      </div>
      <div className="metric-grid two-metrics">
        <div className="metric-card">
          <span>Active visits</span>
          <strong>{visits ? active.length : '—'}</strong>
          <small>Intake and ongoing care</small>
        </div>
        <div className="metric-card">
          <span>Care updates</span>
          <strong>{visits ? unreadTotal : '—'}</strong>
          <small>Unread messages</small>
        </div>
      </div>
      <div className="dashboard-columns">
        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <h2>{history ? 'Visit history' : 'Your visits'}</h2>
              <p className="muted small">Open a visit to continue or view your care plan.</p>
            </div>
            <button className="btn btn-ghost" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
          <div className="list-toolbar">
            <div className="filter-buttons" role="group" aria-label="Filter visits">
              {(['all', 'active', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'filter-button selected' : 'filter-button'}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All visits' : f === 'active' ? 'Active' : 'Care plans'}
                </button>
              ))}
            </div>
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Search visits</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your visits"
                type="search"
              />
            </label>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}{' '}
              <button className="link-btn" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          )}
          {!visits && !error && (
            <p className="loading-state" role="status">
              Loading your visits…
            </p>
          )}
          {visits && shown.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="chat" />
              </span>
              <h3>{visits.length ? 'No matching visits' : 'Your care starts here'}</h3>
              <p>
                {visits.length
                  ? 'Try a different filter or search.'
                  : 'Describe what is bothering you and answer a few intake questions to start a visit.'}
              </p>
              {!visits.length && (
                <Link className="btn" to="/visits">
                  Start your first visit
                  <Icon name="arrow" />
                </Link>
              )}
            </div>
          )}
          <ul className="visit-list">
            {shown.map((visit) => (
              <li key={visit.id}>
                <Link to={`/visits/${visit.id}`} className="visit-row">
                  <span className="visit-row-icon">
                    <Icon name={visit.status === 'resolved' ? 'check' : 'chat'} />
                  </span>
                  <div className="visit-row-main">
                    <div className="visit-row-title">
                      <h3>{visit.complaint}</h3>
                      {visit.unreadCount > 0 && <span className="badge">{visit.unreadCount} new</span>}
                    </div>
                    <p>
                      {formatTime(visit.startedAt)}
                      {visit.doctorName && ` · ${visit.doctorName}`}
                    </p>
                    <VisitStatus status={visit.status} />
                  </div>
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <aside className="dashboard-aside">
          <section className="surface-panel accent-panel">
            <span className="section-icon">
              <Icon name="calendar" />
            </span>
            <h2>Your next steps</h2>
            {appointments.length ? (
              appointments.map((visit) => (
                <Link className="next-step" key={visit.id} to={`/visits/${visit.id}`}>
                  <strong>{visit.complaint}</strong>
                  <span>
                    {visit.status === 'appointment_offered'
                      ? 'Choose an offered time'
                      : 'View your booked appointment'}{' '}
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="muted">Any appointment offered by your doctor will appear here.</p>
            )}
          </section>
          <section className="surface-panel">
            <h2>Account details</h2>
            <dl className="detail-list">
              <div>
                <dt>Health card</dt>
                <dd>
                  {verification?.verified
                    ? `Verified · ending ${verification.last4}`
                    : 'Verification required'}
                </dd>
              </div>
              <div>
                <dt>Care updates</dt>
                <dd>Available in your visits</dd>
              </div>
            </dl>
            <Link className="text-link" to="/account">
              View your account <Icon name="arrow" />
            </Link>
          </section>
          <section className="surface-panel">
            <h2>Care notifications</h2>
            <p className="muted small">
              Enable browser notifications for care updates while Patient Priority is open.
            </p>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  const granted = await askNotificationPermission();
                  setNotificationMessage(
                    granted
                      ? 'Browser notifications are enabled.'
                      : 'Notifications are unavailable or blocked. You can still read updates here.',
                  );
                } catch {
                  setNotificationMessage('Could not enable notifications. Check your browser settings.');
                }
              }}
            >
              <Icon name="bell" />
              Enable notifications
            </button>
            {notificationMessage && (
              <p className="small" role="status">
                {notificationMessage}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

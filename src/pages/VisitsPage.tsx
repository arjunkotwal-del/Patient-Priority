import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { askNotificationPermission, notifyIfHidden, subscribeToUpdates } from '../lib/live';
import { OPEN_STATUSES, PATIENT_STATUS, callApi, formatDate, type MyVisits, type VisitSummary } from './patientApi';

/** Loads the patient's visits and keeps them fresh. Shared by Consultation and History. */
export function useMyVisits() {
  const { getToken } = useAuth();
  const [data, setData] = useState<MyVisits | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await callApi<MyVisits>(getToken, '/me/visits'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your visits.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    return subscribeToUpdates({
      as: 'patient',
      getToken,
      onConnect: () => void load(),
      onEvent: (e) => {
        void load();
        if (e.reason === 'doctor_reply' || e.reason === 'appointment_offered') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
      },
    });
  }, [load, getToken]);

  return { data, error };
}

/** The patient's home: start a consultation, or open one already going. */
export function VisitsPage() {
  const { user } = useAuth();
  const { data, error } = useMyVisits();
  const [notify, setNotify] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const open = data?.visits.filter((v) => OPEN_STATUSES.includes(v.status)) ?? [];
  const firstName = user?.name?.split(/[\s@]/)[0];

  return (
    <div className="page page-narrow">
      <section className="card welcome">
        <div>
          <h1>Welcome back{firstName ? `, ${firstName}` : ''}</h1>
          <div className="welcome-meta">
            <span className="chip chip-low">Virtual fast track</span>
            <span className="mono faint">Minor problems · CTAS 4 and 5</span>
          </div>
        </div>
        <Link to="/visits/new" className="btn btn-lg">Start a visit</Link>
      </section>

      <section className="card chat-panel">
        <span className="chat-stamp">Private consultation · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
        <div className="msg">
          <span className="msg-icon" aria-hidden="true">+</span>
          <div className="msg-main">
            <div className="msg-head"><strong>Intake assistant</strong><span className="msg-tag">AI</span></div>
            <div className="msg-body">Hi! What's bothering you today? A doctor will review your answers and reply here.</div>
          </div>
        </div>
        <div className="suggest">
          <span className="eyebrow">Start with</span>
          <div className="choices">
            {['Sore throat', 'Ear pain', 'Sprained ankle', 'Rash'].map((c) => (
              <Link key={c} to="/visits/new" state={{ complaint: c }} className="choice">{c}</Link>
            ))}
          </div>
        </div>
      </section>

      {notify === 'default' && (
        <div className="card spread">
          <span className="muted">Get a notification when your doctor replies.</span>
          <button className="btn btn-secondary" onClick={async () => { await askNotificationPermission(); setNotify(Notification.permission); }}>
            Turn on
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading your visits…</p>}
      {open.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Open visits</h2><span className="mono faint">{open.length}</span></div>
          <VisitList visits={open} />
        </section>
      )}

      <p className="disclaimer">
        <span />
        <Link to="/history">My medical history →</Link>
      </p>
    </div>
  );
}

export function VisitList({ visits }: { visits: VisitSummary[] }) {
  return (
    <ul className="visit-list">
      {visits.map((v) => (
        <li key={v.id}>
          <Link to={`/visits/${v.id}`} className="visit-row">
            <span className="grow">
              <strong>{v.complaint}</strong>
              <span className="mono">{formatDate(v.startedAt)}{v.doctorName && ` · ${v.doctorName}`}</span>
            </span>
            {v.unreadCount > 0 && <span className="badge">{v.unreadCount}</span>}
            <span className={`status status-${v.status}`}>{PATIENT_STATUS[v.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

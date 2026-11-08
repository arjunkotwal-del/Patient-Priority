import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { CTAS_LABELS, callApi, formatTime, formatWait, type AppointmentItem, type QueueItem } from './doctorApi';

// Live updates refresh the lists right away; this is only a safety net if the stream drops.
const REFRESH_MS = 60_000;
type Tab = 'all' | 'unassigned' | 'mine' | 'appointments';
export const PRIORITY_LABELS = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' } as const;

/** Cases waiting for an answer (highest priority first, then longest wait) and in-person appointments. */
export function DoctorQueuePage() {
  const { getToken, doctor } = useAuth();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');

  const load = useCallback(async () => {
    try {
      const [q, a] = await Promise.all([
        callApi<{ queue: QueueItem[] }>(getToken, '/doctor/queue'),
        callApi<{ appointments: AppointmentItem[] }>(getToken, '/doctor/appointments'),
      ]);
      setQueue(q.queue);
      setAppointments(a.appointments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load patient requests.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const stop = subscribeToUpdates({ as: 'doctor', getToken, onConnect: () => void load(), onEvent: () => void load() });
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [load, getToken]);

  const inTab = (q: QueueItem, t: Tab) =>
    t === 'all' ? true : t === 'mine' ? q.assignedDoctor?.id === doctor?.id : t === 'unassigned' ? !q.assignedDoctor : false;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All waiting', count: queue?.length ?? 0 },
    { id: 'unassigned', label: 'Not taken', count: (queue ?? []).filter((q) => inTab(q, 'unassigned')).length },
    { id: 'mine', label: 'Mine', count: (queue ?? []).filter((q) => inTab(q, 'mine')).length },
    { id: 'appointments', label: 'Appointments', count: appointments?.length ?? 0 },
  ];
  const shown = (queue ?? []).filter((q) => inTab(q, tab));
  const high = (queue ?? []).filter((q) => q.priority === 'high').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Red flags first, then priority · AI rated, rules can only raise it</span>
          <h1>Patient queue</h1>
        </div>
        <div className="row">
          {queue && <span className="on-duty"><span className="dot" aria-hidden="true" />{queue.length} waiting · {high} high</span>}
          <button className="btn btn-secondary" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {queue === null && !error && <p className="muted">Loading…</p>}
      {queue && (
        <div className="queue-tools">
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                {t.label} <span className="tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <span className="mono faint">Updates live</span>
        </div>
      )}

      {tab === 'appointments' ? (
        <div className="queue-list">
          {appointments?.length === 0 && <div className="empty">No in-person appointments.</div>}
          {appointments?.map((a) => (
            <Link key={a.visitId} to={`/doctor/visits/${a.visitId}`} className="qcard">
              <div className="qcard-head">
                <div className="grow">
                  <div className="qcard-title">{a.complaint}</div>
                  <div className="qcard-meta"><span>Patient {a.patientId}</span><span>{a.location}</span><span>{a.doctorName}</span></div>
                </div>
                <span className={a.status === 'booked' ? 'chip chip-low' : 'chip chip-medium'}>{a.status === 'booked' ? 'Booked' : 'Offered'}</span>
              </div>
              <div className="qcard-foot">
                <span>{a.status === 'booked' ? `Booked for ${formatTime(a.time)}` : `Waiting for the patient to pick · earliest ${formatTime(a.time)}`}</span>
                <span className="accent">Open →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="queue-list">
          {queue && shown.length === 0 && <div className="empty">{queue.length === 0 ? 'No patients are waiting right now.' : 'No requests here.'}</div>}
          {shown.map((item) => {
            const mine = item.assignedDoctor?.id === doctor?.id;
            return (
              <Link key={item.visitId} to={`/doctor/visits/${item.visitId}`} className={`qcard prio-${item.priority}${item.redFlags.length ? ' flagged' : ''}`}>
                <div className="qcard-head">
                  <div className="grow">
                    <div className="qcard-title">{item.complaint}</div>
                    <div className="qcard-meta">
                      <span>Patient {item.patientId}</span>
                      <span>Case #{item.visitId}</span>
                      <span>Waiting {formatWait(item.waitingMinutes)}</span>
                    </div>
                  </div>
                  <div className="qcard-side">
                    {item.redFlags.length > 0 && <span className="chip chip-danger">Red flag</span>}
                    <span className={`chip chip-${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>
                    <span className="chip plain" title={item.suggestedCtas ? CTAS_LABELS[item.suggestedCtas] : 'Not triaged'}>
                      {item.suggestedCtas ? `CTAS ${item.suggestedCtas} · AI` : 'CTAS ?'}
                    </span>
                  </div>
                </div>
                {item.priorityReasons.length > 0 && (
                  <div className="reasons" title="Why this priority">
                    {item.priorityReasons.map((r) => <span key={r} className="reason">{r}</span>)}
                  </div>
                )}
                <div className="qcard-foot">
                  <span>
                    <span className={item.assignedDoctor ? 'dot dot-slate' : 'dot'} aria-hidden="true" />{' '}
                    {item.assignedDoctor ? (mine ? 'Assigned to you' : `With ${item.assignedDoctor.name}`) : 'AI intake complete · not taken'}
                  </span>
                  <span className="row">
                    {item.unreadForDoctor > 0 && <span className="badge">{item.unreadForDoctor}</span>}
                    <span className="accent">Open case →</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

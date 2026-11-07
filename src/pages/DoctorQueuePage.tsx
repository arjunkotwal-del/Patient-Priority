import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { CTAS_LABELS, callApi, formatTime, formatWait, type AppointmentItem, type QueueItem } from './doctorApi';

// Live updates refresh the lists right away; this is only a safety net if the stream drops.
const REFRESH_MS = 60_000;
type Tab = 'all' | 'unassigned' | 'mine' | 'appointments';

/** Cases waiting for an answer (most urgent first) and in-person appointments. */
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

  return (
    <div className="doctor">
      <div className="doctor-header">
        <div>
          <h1>Patient queue</h1>
          <p className="muted">Most urgent first, then longest wait. Updates live.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}
      {queue === null && !error && <p className="muted">Loading…</p>}
      {queue && (
        <div className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label} <span className="tab-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'appointments' ? (
        <>
          {appointments?.length === 0 && <div className="card"><p>No in-person appointments.</p></div>}
          <ul className="queue">
            {appointments?.map((a) => (
              <li key={a.visitId}>
                <Link to={`/doctor/visits/${a.visitId}`} className="queue-item">
                  <span className={a.status === 'booked' ? 'pill pill-booked' : 'pill'}>{a.status === 'booked' ? 'Booked' : 'Offered'}</span>
                  <span className="queue-main">
                    <strong>{a.complaint}</strong>
                    <span className="muted">
                      {a.status === 'booked' ? formatTime(a.time) : `Waiting for the patient to pick (earliest ${formatTime(a.time)})`} · {a.location} · {a.doctorName}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {queue && shown.length === 0 && <div className="card"><p>{queue.length === 0 ? 'No patients are waiting right now.' : 'No requests here.'}</p></div>}
          <ul className="queue">
            {shown.map((item) => {
              const mine = item.assignedDoctor?.id === doctor?.id;
              return (
                <li key={item.visitId}>
                  <Link to={`/doctor/visits/${item.visitId}`} className="queue-item">
                    <span className={`ctas ctas-${item.suggestedCtas ?? 'none'}`} title={item.suggestedCtas ? CTAS_LABELS[item.suggestedCtas] : 'Not triaged'}>
                      {item.suggestedCtas ? `CTAS ${item.suggestedCtas}` : 'CTAS ?'}
                    </span>
                    <span className="queue-main">
                      <strong>{item.complaint}</strong>
                      <span className="muted">
                        Waiting {formatWait(item.waitingMinutes)}
                        {item.assignedDoctor && ` · ${mine ? 'assigned to you' : item.assignedDoctor.name}`}
                      </span>
                    </span>
                    {item.unreadForDoctor > 0 && <span className="badge">{item.unreadForDoctor} new</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CTAS_LABELS, STATUS_LABELS, callApi, formatWait, type QueueItem } from './doctorApi';

const REFRESH_MS = 30_000;
type Filter = 'all' | 'mine' | 'unassigned';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All open' },
  { id: 'unassigned', label: 'Not taken' },
  { id: 'mine', label: 'Mine' },
];

/** Open patient requests, most urgent first. Refreshes on its own every 30 seconds. */
export function DoctorQueuePage() {
  const { getToken, doctor } = useAuth();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const body = await callApi<{ queue: QueueItem[] }>(getToken, '/doctor/queue');
      setQueue(body.queue);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load patient requests.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const count = (f: Filter) =>
    (queue ?? []).filter((q) => (f === 'all' ? true : f === 'mine' ? q.assignedDoctor?.id === doctor?.id : !q.assignedDoctor)).length;
  const shown = (queue ?? []).filter((q) =>
    filter === 'all' ? true : filter === 'mine' ? q.assignedDoctor?.id === doctor?.id : !q.assignedDoctor,
  );

  return (
    <div className="doctor">
      <div className="doctor-header">
        <div>
          <h1>Patient queue</h1>
          <p className="muted">Most urgent first, then longest wait. Updates every 30 seconds.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => void load()}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}
      {queue === null && !error && <p className="muted">Loading…</p>}
      {queue && (
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'tab active' : 'tab'} onClick={() => setFilter(f.id)}>
              {f.label} <span className="tab-count">{count(f.id)}</span>
            </button>
          ))}
        </div>
      )}
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
                    {STATUS_LABELS[item.status]} · waiting {formatWait(item.waitingMinutes)}
                    {item.assignedDoctor && ` · ${mine ? 'assigned to you' : item.assignedDoctor.name}`}
                  </span>
                </span>
                {item.unreadForDoctor > 0 && <span className="badge">{item.unreadForDoctor} new</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

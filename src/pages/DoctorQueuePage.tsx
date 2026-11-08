import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { DoctorCase } from './DoctorCase';
import { CTAS_LABELS, PRIORITY_LABELS, callApi, formatWait, type QueueItem } from './doctorApi';

// Live updates refresh the queue right away; this is only a safety net if the stream drops.
const REFRESH_MS = 60_000;

/**
 * The doctor's only page: the queue, worst first (priority, then CTAS, then pain, then wait;
 * the server sorts it, see getQueue in server/db.js).
 * The case at the front is opened in full so the doctor can give advice or schedule a
 * meeting. The rest are shown below in order and can't be skipped to.
 */
export function DoctorQueuePage() {
  const { getToken, doctor } = useAuth();
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = await callApi<{ queue: QueueItem[] }>(getToken, '/doctor/queue');
      setQueue(q.queue);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue.');
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

  // The first case this doctor can work on: unclaimed, or already theirs.
  // A case another doctor is handling stays in line but is skipped here.
  const current = queue?.find((q) => !q.assignedDoctor || q.assignedDoctor.id === doctor?.id) ?? null;
  const upNext = (queue ?? []).filter((q) => q !== current);

  return (
    <div className="doctor">
      <div className="doctor-header">
        <div>
          <h1>Patient queue</h1>
          <p className="muted">
            {queue ? `${queue.length} waiting · ` : ''}Worst first: priority, then CTAS, then pain, then longest wait. Updates live.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {queue === null && !error && <p className="muted">Loading…</p>}
      {queue && queue.length === 0 && <div className="card"><p>No patients are waiting right now.</p></div>}
      {queue && queue.length > 0 && !current && (
        <div className="card"><p>Every waiting case is being handled by another doctor.</p></div>
      )}

      {current && <DoctorCase key={current.visitId} item={current} onDone={load} />}

      {upNext.length > 0 && (
        <section aria-labelledby="up-next">
          <h2 id="up-next">Up next</h2>
          <ol className="queue">
            {upNext.map((item) => (
              <li key={item.visitId} className="queue-item queue-item-static">
                <span className={`priority priority-${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>
                <span className={`ctas ctas-${item.suggestedCtas ?? 'none'}`} title={item.suggestedCtas ? CTAS_LABELS[item.suggestedCtas] : 'Not triaged'}>
                  {item.suggestedCtas ? `CTAS ${item.suggestedCtas}` : 'CTAS ?'}
                </span>
                <span className="queue-main">
                  <strong>{item.complaint}</strong>
                  <span className="muted">
                    Waiting {formatWait(item.waitingMinutes)}
                    {item.painScore != null && ` · pain ${item.painScore}/10`}
                    {item.assignedDoctor && ` · ${item.assignedDoctor.name} is handling this`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { DoctorCase } from './DoctorCase';
import { CTAS_LABELS, PRIORITY_LABELS, callApi, formatWait, type QueueItem } from './doctorApi';

// Live updates refresh the queue right away; this is only a safety net if the stream drops.
const REFRESH_MS = 60_000;

/**
 * The priority queue, worst first (red flags, then priority, CTAS, pain and wait;
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
  const high = (queue ?? []).filter((q) => q.priority === 'high').length;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">Red flags first, then priority, CTAS, pain and wait · AI rated, rules can only raise it</span>
          <h1>Priority queue</h1>
        </div>
        <div className="row">
          {queue && <span className="on-duty"><span className="dot" aria-hidden="true" />{queue.length} waiting · {high} high</span>}
          <button className="btn btn-secondary" onClick={() => void load()}>Refresh</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {queue === null && !error && <p className="muted">Loading…</p>}
      {queue && queue.length === 0 && <div className="empty">No patients are waiting right now.</div>}
      {queue && queue.length > 0 && !current && <div className="empty">Every waiting case is being handled by another doctor.</div>}

      {current && <DoctorCase key={current.visitId} item={current} onDone={load} />}

      {upNext.length > 0 && (
        <section aria-labelledby="up-next" className="stack">
          <div className="queue-tools">
            <h2 id="up-next">Up next</h2>
            <span className="mono faint">In order · updates live</span>
          </div>
          <ol className="queue-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {upNext.map((item) => (
              <li key={item.visitId} className={`qcard prio-${item.priority}${item.redFlags.length ? ' flagged' : ''}`}>
                <div className="qcard-head">
                  <div className="grow">
                    <div className="qcard-title">{item.complaint}</div>
                    <div className="qcard-meta">
                      <span>Patient {item.patientId}</span>
                      <span>Case #{item.visitId}</span>
                      <span>Waiting {formatWait(item.waitingMinutes)}</span>
                      {item.painScore != null && <span>Pain {item.painScore}/10</span>}
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
                {item.assignedDoctor && (
                  <div className="qcard-foot">
                    <span><span className="dot dot-slate" aria-hidden="true" /> With {item.assignedDoctor.name}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

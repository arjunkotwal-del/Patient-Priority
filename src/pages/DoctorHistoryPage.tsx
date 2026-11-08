import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CTAS_LABELS, OUTCOME_LABELS, callApi, formatTime, type HistoryItem } from './doctorApi';

type Outcome = 'all' | 'advice' | 'meeting';
const SEARCH_DELAY_MS = 300;

/**
 * Every case taken off the queue (advice sent or meeting scheduled), newest first.
 * The search and filters live in the URL, so going back from a case keeps them.
 */
export function DoctorHistoryPage() {
  const { getToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const outcome = (['advice', 'meeting'].includes(params.get('outcome') ?? '') ? params.get('outcome') : 'all') as Outcome;
  const mine = params.get('mine') === '1';

  const [text, setText] = useState(q);
  const [result, setResult] = useState<{ cases: HistoryItem[]; more: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => update({ q: text.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({ q, outcome, ...(mine ? { mine: '1' } : {}) });
    callApi<{ cases: HistoryItem[]; more: boolean }>(getToken, `/doctor/history?${query}`)
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the history.'));
    return () => {
      cancelled = true;
    };
  }, [getToken, q, outcome, mine]);

  return (
    <div className="doctor">
      <div className="doctor-header">
        <div>
          <h1>History</h1>
          <p className="muted">Cases taken off the queue, newest first.</p>
        </div>
      </div>

      <form className="card history-search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() }); }}>
        <label className="history-query">
          Search past cases
          <input type="search" value={text} maxLength={200} onChange={(e) => setText(e.target.value)}
            placeholder="Complaint, diagnosis, patient ID, notes or doctor" />
        </label>
        <label>
          Outcome
          <select value={outcome} onChange={(e) => update({ outcome: e.target.value === 'all' ? '' : e.target.value })}>
            <option value="all">All</option>
            <option value="advice">Advice sent</option>
            <option value="meeting">Meeting scheduled</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={mine} onChange={(e) => update({ mine: e.target.checked ? '1' : '' })} />
          Only my cases
        </label>
      </form>

      {error && <p className="error">{error}</p>}
      {!result && !error && <p className="muted">Loading…</p>}
      {result && result.cases.length === 0 && (
        <div className="card"><p>{q || outcome !== 'all' || mine ? 'No past cases match.' : 'No cases have been closed yet.'}</p></div>
      )}

      {result && result.cases.length > 0 && (
        <ul className="queue">
          {result.cases.map((c) => (
            <li key={c.visitId}>
              <Link to={`/doctor/history/${c.visitId}${params.size ? `?from=${encodeURIComponent(`?${params}`)}` : ''}`} className="queue-item">
                <span className={c.status === 'resolved' ? 'pill pill-advice' : c.status === 'appointment_booked' ? 'pill pill-booked' : 'pill'}>
                  {OUTCOME_LABELS[c.status]}
                </span>
                <span className="queue-main">
                  <strong>{c.complaint}</strong>
                  <span className="muted">
                    {c.diagnosis ? `Diagnosis: ${c.diagnosis}` : 'No diagnosis yet'}
                    {` · Patient ${c.patientId}`}
                    {c.ctas && ` · CTAS ${c.ctas} (${CTAS_LABELS[c.ctas]})`}
                    {c.doctorName && ` · ${c.doctorName}`}
                  </span>
                </span>
                <span className="queue-item-date">{formatTime(c.closedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {result?.more && <p className="muted small">Showing the newest 100. Search to narrow it down.</p>}
    </div>
  );
}

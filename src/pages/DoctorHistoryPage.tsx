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
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">Advice sent and meetings scheduled · newest first</span>
          <h1>History</h1>
        </div>
        {result && <span className="on-duty"><span className="dot" aria-hidden="true" />{result.cases.length}{result.more ? '+' : ''} cases</span>}
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
        <div className="empty">{q || outcome !== 'all' || mine ? 'No past cases match.' : 'No cases have been closed yet.'}</div>
      )}

      {result && result.cases.length > 0 && (
        <div className="queue-list">
          {result.cases.map((c) => (
            <Link key={c.visitId} to={`/doctor/history/${c.visitId}${params.size ? `?from=${encodeURIComponent(`?${params}`)}` : ''}`} className="qcard">
              <div className="qcard-head">
                <div className="grow">
                  <div className="qcard-title">{c.complaint}</div>
                  <div className="qcard-meta">
                    <span>Patient {c.patientId}</span>
                    <span>Case #{c.visitId}</span>
                    {c.doctorName && <span>{c.doctorName}</span>}
                  </div>
                </div>
                <div className="qcard-side">
                  <span className={c.status === 'resolved' ? 'chip chip-low' : 'chip chip-medium'}>{OUTCOME_LABELS[c.status]}</span>
                  {c.ctas && <span className="chip plain" title={CTAS_LABELS[c.ctas]}>CTAS {c.ctas}</span>}
                </div>
              </div>
              <div className="qcard-foot">
                <span>{c.diagnosis ? `Diagnosis: ${c.diagnosis}` : 'No diagnosis yet'}</span>
                <span className="row"><span className="mono faint">{formatTime(c.closedAt)}</span><span className="accent">Open →</span></span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {result?.more && <p className="muted small">Showing the newest 100. Search to narrow it down.</p>}
    </div>
  );
}

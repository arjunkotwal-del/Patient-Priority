import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePatientVisits } from '../components/PatientVisitsContext';
import { Icon } from '../components/LineIcon';
import { VisitStatus } from '../components/VisitStatus';
import { callApi, formatDate } from './patientApi';

/** GET /api/me/history */
interface MedicalHistory {
  lastVisit: { visitId: number; complaint: string; startedAt: string } | null;
  totalVisits: number;
  prescriptions: {
    medication: string;
    dose: string;
    frequency: string;
    duration: string;
    instructions: string;
    prescribedAt: string;
    doctorName: string;
    visitId: number;
    forWhat: string;
    complaint: string;
  }[];
}

/** The patient's medical history: medicines they were prescribed, what for, and their visits. */
export function MedicalHistoryPage() {
  const { getToken } = useAuth();
  const { visits } = usePatientVisits();
  const [history, setHistory] = useState<MedicalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await callApi<MedicalHistory>(getToken, '/me/history'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your medical history.');
    }
  }, [getToken]);

  // Reload when the visits change, e.g. a doctor just replied with a prescription.
  useEffect(() => {
    void load();
  }, [load, visits]);

  const medicines = new Set(history?.prescriptions.map((p) => p.medication.toLowerCase())).size;

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR RECORDS</p>
          <h1>Medical history</h1>
          <p className="muted">Medicines your doctors prescribed, what they were for, and your past visits.</p>
        </div>
        <Link to="/visits" className="btn">
          <Icon name="plus" />
          Start a visit
        </Link>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Last visit</span>
          <strong className="metric-text">{history ? (history.lastVisit ? formatDate(history.lastVisit.startedAt) : 'None yet') : '—'}</strong>
          <small>{history?.lastVisit ? history.lastVisit.complaint : 'Your most recent visit'}</small>
        </div>
        <div className="metric-card">
          <span>Medicines prescribed</span>
          <strong>{history ? medicines : '—'}</strong>
          <small>Across all your visits</small>
        </div>
        <div className="metric-card">
          <span>Visits</span>
          <strong>{history ? history.totalVisits : '—'}</strong>
          <small>Since you joined</small>
        </div>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}{' '}
          <button className="link-btn" onClick={() => void load()}>Try again</button>
        </div>
      )}

      <div className="dashboard-columns">
        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <h2>Prescribed medicines</h2>
              <p className="muted small">Newest first. Ask a pharmacist if you have questions about a medicine.</p>
            </div>
          </div>
          {!history && !error && <p className="loading-state" role="status">Loading your medicines…</p>}
          {history && history.prescriptions.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon"><Icon name="book" /></span>
              <h3>No prescriptions yet</h3>
              <p>When a doctor prescribes you something, it will show up here with what it was for.</p>
            </div>
          )}
          <ul className="med-list">
            {history?.prescriptions.map((p, i) => (
              <li key={i} className="med-item">
                <div className="med-head">
                  <h3>{p.medication} <span>{p.dose}</span></h3>
                  <span className="med-date">{formatDate(p.prescribedAt)}</span>
                </div>
                <p className="med-for"><strong>For:</strong> {p.forWhat}</p>
                <p className="muted small">{p.frequency}{p.duration && ` · for ${p.duration}`}{p.instructions && ` · ${p.instructions}`}</p>
                <p className="small">
                  Prescribed by {p.doctorName} · <Link to={`/visits/${p.visitId}`} className="text-link">Open visit</Link>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <aside className="dashboard-aside">
          <section className="surface-panel">
            <h2>Past visits</h2>
            {!visits && <p className="muted small">Loading…</p>}
            {visits && visits.length === 0 && <p className="muted small">No visits yet.</p>}
            <ul className="history-visits">
              {visits?.map((v) => (
                <li key={v.id}>
                  <Link to={`/visits/${v.id}`}>
                    <strong>{v.complaint}</strong>
                    <span className="muted small">{formatDate(v.startedAt)}{v.doctorName && ` · ${v.doctorName}`}</span>
                    <VisitStatus status={v.status} doctorName={v.doctorName} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

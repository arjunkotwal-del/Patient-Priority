import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AdviceForm, type Act } from './DoctorCase';
import { CTAS_LABELS, OUTCOME_LABELS, PRIORITY_LABELS, callApi, deleteHistoryCase, formatTime as time, type DoctorVisitDetail, type HistoryItem } from './doctorApi';

const SENDER_LABELS = { patient: 'Patient', ai: 'Intake assistant', doctor: 'Doctor' } as const;
const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;
const list = (items: string[] | undefined) => (items?.length ? items.join(', ') : 'None on file');

/** One past case, read-only. A booked meeting can be closed here with advice afterwards. */
export function DoctorHistoryCasePage() {
  const { id = '' } = useParams();
  const { search } = useLocation();
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<DoctorVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const path = `/doctor/visits/${encodeURIComponent(id)}`;
  // Back to the list with the same search, if we came from one.
  const listUrl = `/doctor/history${new URLSearchParams(search).get('from') ?? ''}`;
  const back = <Link to={listUrl} className="back">← History</Link>;

  const remove = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      if (await deleteHistoryCase(getToken, detail.visit.id)) navigate(listUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this case.');
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    try {
      setDetail(await callApi<DoctorVisitDetail>(getToken, path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this case.');
    }
  }, [getToken, path]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  const act: Act = useCallback(
    async (name, body = {}) => {
      try {
        await callApi(getToken, `${path}/${name}`, body);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Something went wrong.';
      } finally {
        await load();
      }
    },
    [getToken, path, load],
  );

  if (error && !detail) return <div className="page">{back}<p className="error">{error}</p></div>;
  if (!detail) return <div className="page"><p className="muted">Loading…</p></div>;

  const { visit, history } = detail;
  const status = visit.status as HistoryItem['status'];
  const ctas = visit.confirmedCtas ?? visit.suggestedCtas;
  const doctorMessages = visit.messages.filter((m) => m.from === 'doctor');
  const intake = visit.messages.filter((m) => m.from !== 'doctor');

  return (
    <div className="page page-wide">
      {back}

      <div className="work-head">
        <div>
          <span className="eyebrow">
            Case #{visit.id} · Patient {visit.patientId} · checked in {time(visit.startedAt)}
            {visit.resolvedAt && ` · closed ${time(visit.resolvedAt)}`}
          </span>
          <h1>{visit.complaint}</h1>
        </div>
        <div className="row">
          <span className={status === 'resolved' ? 'chip chip-low' : 'chip chip-medium'}>{OUTCOME_LABELS[status] ?? status.replaceAll('_', ' ')}</span>
          {visit.priority && <span className={`chip chip-${visit.priority}`}>{PRIORITY_LABELS[visit.priority]}</span>}
          <span className="chip plain">{ctas ? `CTAS ${ctas} · ${CTAS_LABELS[ctas]}` : 'Not triaged'}</span>
          <Link to={`/doctor/visits/${visit.id}`} className="btn btn-secondary">Full case: notes →</Link>
          <button type="button" className="btn btn-danger" disabled={deleting} onClick={() => void remove()}>
            {deleting ? 'Deleting…' : 'Delete case'}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="doctor-grid">
        <div className="doctor-main">
          {status === 'resolved' && (
            <section className="card">
              <h2>Outcome</h2>
              <dl className="qa">
                <div><dt>Diagnosis</dt><dd>{visit.diagnosis ?? '—'}</dd></div>
                <div>
                  <dt>Confirmed CTAS</dt>
                  <dd>{visit.confirmedCtas ?? '—'}{visit.ctasOverrideReason && ` (changed from ${visit.suggestedCtas}: ${visit.ctasOverrideReason})`}</dd>
                </div>
                <div><dt>Closed by</dt><dd>{visit.doctor?.name ?? '—'}{visit.resolvedAt && ` · ${time(visit.resolvedAt)}`}</dd></div>
              </dl>
            </section>
          )}

          {visit.appointment && (
            <section className="card">
              <h2>In-person meeting</h2>
              <p>
                {visit.appointment.location} · {visit.appointment.doctorName} ·{' '}
                {visit.appointment.status === 'booked' ? 'booked' : 'waiting for the patient to pick a time'}
              </p>
              {visit.appointment.description && <p className="muted pre-wrap">{visit.appointment.description}</p>}
              <ul className="slots">
                {visit.appointment.slots.map((s) => (
                  <li key={s.id} className={s.chosen ? 'chosen' : ''}>{time(s.startsAt)}{s.chosen && ' ✓ chosen'}</li>
                ))}
              </ul>
            </section>
          )}

          {status === 'appointment_booked' && (
            <section className="card actions">
              <h2>Close after the meeting</h2>
              <AdviceForm act={act} />
            </section>
          )}

          {doctorMessages.length > 0 && (
            <section className="card">
              <h2>Sent to the patient</h2>
              {doctorMessages.map((m, i) => (
                <div key={i} className="past-visit">
                  <span>{m.text}</span>
                  <span className="muted small">{m.kind === 'appointment' ? 'Meeting offer' : 'Advice'} · {time(m.sentAt)}</span>
                </div>
              ))}
            </section>
          )}

          {(visit.prescriptions.length > 0 || visit.orders.length > 0) && (
            <section className="card">
              <h2>Prescriptions and tests</h2>
              {visit.prescriptions.map((p, i) => (
                <div key={`rx${i}`} className="past-visit">
                  <strong>℞ {p.medication} {p.dose}</strong>
                  <span>{p.frequency} · {p.duration}{p.instructions && ` · ${p.instructions}`}</span>
                  <span className="muted small">{p.doctorName} · {time(p.prescribedAt)}</span>
                </div>
              ))}
              {visit.orders.map((o, i) => (
                <div key={`o${i}`} className="past-visit">
                  <strong>{ORDER_LABELS[o.type]}: {o.name}</strong>
                  {o.instructions && <span>{o.instructions}</span>}
                  <span className="muted small">{o.doctorName} · {time(o.orderedAt)}</span>
                </div>
              ))}
            </section>
          )}

          {visit.soap && (
            <section className="card">
              <h2>AI intake summary</h2>
              <dl className="qa">
                <div><dt>Subjective</dt><dd>{visit.soap.subjective}</dd></div>
                <div><dt>Assessment</dt><dd>{visit.soap.assessment}</dd></div>
                <div><dt>Plan</dt><dd>{visit.soap.plan}</dd></div>
              </dl>
            </section>
          )}

          <section className="card">
            <h2>Symptoms reported at check-in</h2>
            {visit.premadeAnswers.length > 0 ? (
              <dl className="qa">
                {visit.premadeAnswers.map((qa, i) => <div key={i}><dt>{qa.question}</dt><dd>{qa.answer}</dd></div>)}
              </dl>
            ) : (
              <p className="muted">No check-in answers recorded.</p>
            )}
            {intake.length > 0 && (
              <details>
                <summary>Full intake conversation ({intake.length} messages)</summary>
                <ol className="chat">
                  {intake.map((m, i) => (
                    <li key={i} className={`chat-msg from-${m.from}`}>
                      <span className="chat-meta">{SENDER_LABELS[m.from]} · {time(m.sentAt)}</span>
                      <span>{m.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>
        </div>

        <aside className="doctor-side">
          <section className="card">
            <h2>Patient</h2>
            <dl className="qa">
              <div><dt>Allergies</dt><dd>{list(history?.allergies)}</dd></div>
              <div><dt>Current medications</dt><dd>{list(history?.currentMeds)}</dd></div>
              <div><dt>Conditions</dt><dd>{list(history?.conditions)}</dd></div>
            </dl>
          </section>
          <section className="card">
            <h2>Other visits</h2>
            {!history?.pastVisits.length && <p className="muted">None on file.</p>}
            {history?.pastVisits.map((v, i) => (
              <div key={i} className="past-visit">
                <strong>{v.date}: {v.complaint}</strong>
                {v.diagnosis && <span>Diagnosis: {v.diagnosis}</span>}
                {v.plan && <span className="muted">{v.plan}</span>}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { CTAS_LABELS, PRIORITY_LABELS, callApi, formatTime as time, type DoctorVisitDetail, type QueueItem } from './doctorApi';

const SENDER_LABELS = { patient: 'Patient', ai: 'Intake assistant', doctor: 'Doctor' } as const;
const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;
const list = (items: string[] | undefined) => (items?.length ? items.join(', ') : 'None on file');

type Action = 'advice' | 'meeting';
export type Act = (action: string, body?: object) => Promise<string | null>;

/**
 * The case at the front of the queue, in full, with the doctor's two choices:
 * give advice (one reply that closes the case) or schedule an in-person meeting.
 * Either one takes the case off the queue; `onDone` then reloads the queue.
 */
export function DoctorCase({ item, onDone }: { item: QueueItem; onDone: () => Promise<void> }) {
  const { visitId } = item;
  const { getToken } = useAuth();
  const [detail, setDetail] = useState<DoctorVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>('advice');
  const path = `/doctor/visits/${visitId}`;

  // Opening the case also marks it read for the doctor (done by the server).
  const load = useCallback(async () => {
    try {
      setDetail(await callApi<DoctorVisitDetail>(getToken, path));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this case.');
    }
  }, [getToken, path]);

  useEffect(() => {
    void load();
    return subscribeToUpdates({
      as: 'doctor',
      getToken,
      onEvent: (e) => {
        if (String(e.visitId) === String(visitId)) void load();
      },
    });
  }, [load, getToken, visitId]);

  /** Sends an action, then reloads the queue (the case leaves it on success). Returns an error for the form, or null. */
  const act: Act = useCallback(
    async (name, body = {}) => {
      try {
        await callApi(getToken, `${path}/${name}`, body);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Something went wrong.';
      } finally {
        await onDone();
      }
    },
    [getToken, path, onDone],
  );

  if (error && !detail) return <div className="card"><p className="error">{error}</p></div>;
  if (!detail) return <div className="card"><p className="muted">Loading the next case…</p></div>;

  const { visit, history } = detail;
  const ctas = visit.suggestedCtas;

  return (
    <article className="doctor" aria-labelledby="case-title">
      <div className="doctor-header">
        <div>
          <p className="eyebrow">FRONT OF THE QUEUE</p>
          <h2 id="case-title" className="case-title">{visit.complaint}</h2>
          <p className="muted">
            Patient {visit.patientId} · checked in {time(visit.startedAt)}
            {item.painScore != null && ` · pain ${item.painScore}/10`}
          </p>
        </div>
        <div className="case-badges">
          <span className={`priority priority-${item.priority}`}>{PRIORITY_LABELS[item.priority]}</span>
          <span className={`ctas ctas-${ctas ?? 'none'}`}>{ctas ? `CTAS ${ctas} · ${CTAS_LABELS[ctas]}` : 'Not triaged'}</span>
        </div>
      </div>

      {item.priorityReasons.length > 0 && (
        <section className="card">
          <h3>Why this case is first</h3>
          <ul>{item.priorityReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      )}

      {visit.redFlags.length > 0 && (
        <div className="card alert">
          <h3>Red flags</h3>
          <ul>{visit.redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      <div className="doctor-grid">
        <div className="doctor-main">
          {visit.soap && (
            <section className="card">
              <h2>AI intake summary</h2>
              <p className="muted small">Written by the intake assistant for doctor review. Not a diagnosis.</p>
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
            {visit.messages.length > 0 && (
              <details>
                <summary>Full intake conversation ({visit.messages.length} messages)</summary>
                <ol className="chat">
                  {visit.messages.map((m, i) => (
                    <li key={i} className={`chat-msg from-${m.from}`}>
                      <span className="chat-meta">{SENDER_LABELS[m.from]} · {time(m.sentAt)}</span>
                      <span>{m.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          <section className="card actions">
            <h2>Your response</h2>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={action === 'advice'} className={action === 'advice' ? 'tab active' : 'tab'} onClick={() => setAction('advice')}>
                Give advice
              </button>
              <button role="tab" aria-selected={action === 'meeting'} className={action === 'meeting' ? 'tab active' : 'tab'} onClick={() => setAction('meeting')}>
                Schedule a meeting
              </button>
            </div>
            {action === 'advice' ? <AdviceForm act={act} suggestedCtas={visit.suggestedCtas} /> : <MeetingForm act={act} />}
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
            <h2>Past visits</h2>
            {!history?.pastVisits.length && <p className="muted">None on file.</p>}
            {history?.pastVisits.map((v, i) => (
              <div key={i} className="past-visit">
                <strong>{v.date}: {v.complaint}</strong>
                {v.diagnosis && <span>Diagnosis: {v.diagnosis}</span>}
                {v.prescriptions?.length ? <span>Prescribed: {v.prescriptions.join(', ')}</span> : null}
                {v.plan && <span className="muted">{v.plan}</span>}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </article>
  );
}

/** Shared submit handling: shows the server's error, and clears the form on success. */
function useSubmit(send: () => Promise<string | null>, reset: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await send();
    setBusy(false);
    setError(err);
    if (!err) reset();
  };
  const message: ReactNode = error && <p className="error">{error}</p>;
  return { busy, onSubmit, message };
}

const EMPTY_RX = { medication: '', dose: '', frequency: '', duration: '', instructions: '' };
const EMPTY_ORDER = { type: 'lab', name: '', instructions: '' };
const isBlank = (row: Record<string, string>, skip: string[] = []) =>
  Object.entries(row).every(([k, v]) => skip.includes(k) || !v.trim());

/** Advice: the doctor's one reply (message, diagnosis, CTAS, any prescriptions and tests). Closes the case. */
export function AdviceForm({ act, suggestedCtas }: { act: Act; suggestedCtas: number | null }) {
  const defaultCtas = suggestedCtas === 4 || suggestedCtas === 5 ? suggestedCtas : 4;
  const empty = { message: '', diagnosis: '', confirmedCtas: defaultCtas, ctasOverrideReason: '' };
  const [v, setV] = useState(empty);
  const [rxs, setRxs] = useState<(typeof EMPTY_RX)[]>([]);
  const [orders, setOrders] = useState<(typeof EMPTY_ORDER)[]>([]);
  const changed = suggestedCtas != null && v.confirmedCtas !== suggestedCtas;

  const form = useSubmit(
    () =>
      act('reply', {
        ...v,
        ctasOverrideReason: changed ? v.ctasOverrideReason : undefined,
        prescriptions: rxs.filter((r) => !isBlank(r)),
        orders: orders.filter((o) => !isBlank(o, ['type'])),
      }),
    () => {
      setV(empty);
      setRxs([]);
      setOrders([]);
    },
  );

  const setRx = (i: number, key: keyof typeof EMPTY_RX, value: string) => setRxs(rxs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const setOrder = (i: number, key: keyof typeof EMPTY_ORDER, value: string) =>
    setOrders(orders.map((o, j) => (j === i ? { ...o, [key]: value } : o)));

  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <p className="muted small">You send this once and it closes the case, so include everything the patient needs.</p>
      <label>
        Advice for the patient
        <textarea value={v.message} rows={5} maxLength={5000} required onChange={(e) => setV({ ...v, message: e.target.value })} />
      </label>
      <div className="form-row">
        <label>
          Diagnosis
          <input value={v.diagnosis} maxLength={500} required onChange={(e) => setV({ ...v, diagnosis: e.target.value })} />
        </label>
        <label>
          Confirm CTAS {suggestedCtas != null && <span className="muted small">(AI suggested {suggestedCtas})</span>}
          <select value={v.confirmedCtas} onChange={(e) => setV({ ...v, confirmedCtas: Number(e.target.value) })}>
            <option value={4}>4 · {CTAS_LABELS[4]}</option>
            <option value={5}>5 · {CTAS_LABELS[5]}</option>
          </select>
        </label>
      </div>
      <p className="muted small">More urgent than CTAS 4? Schedule a meeting instead.</p>
      {changed && (
        <label>
          Why are you changing the CTAS level?
          <input value={v.ctasOverrideReason} maxLength={1000} required onChange={(e) => setV({ ...v, ctasOverrideReason: e.target.value })} />
        </label>
      )}

      <fieldset className="items">
        <legend>Prescriptions</legend>
        {rxs.map((r, i) => (
          <div key={i} className="item-row">
            <div className="form-row">
              <label>Medication<input value={r.medication} maxLength={200} required onChange={(e) => setRx(i, 'medication', e.target.value)} placeholder="Ibuprofen" /></label>
              <label>Dose<input value={r.dose} maxLength={200} required onChange={(e) => setRx(i, 'dose', e.target.value)} placeholder="400 mg" /></label>
            </div>
            <div className="form-row">
              <label>Frequency<input value={r.frequency} maxLength={200} required onChange={(e) => setRx(i, 'frequency', e.target.value)} placeholder="Every 8 hours as needed" /></label>
              <label>Duration<input value={r.duration} maxLength={200} required onChange={(e) => setRx(i, 'duration', e.target.value)} placeholder="5 days" /></label>
            </div>
            <label>Instructions (optional)<input value={r.instructions} maxLength={1000} onChange={(e) => setRx(i, 'instructions', e.target.value)} placeholder="Take with food." /></label>
            <button type="button" className="link-btn" onClick={() => setRxs(rxs.filter((_, j) => j !== i))}>Remove prescription</button>
          </div>
        ))}
        {rxs.length < 10 && (
          <button type="button" className="btn btn-ghost" onClick={() => setRxs([...rxs, { ...EMPTY_RX }])}>+ Add prescription</button>
        )}
      </fieldset>

      <fieldset className="items">
        <legend>Tests and referrals</legend>
        {orders.map((o, i) => (
          <div key={i} className="item-row">
            <div className="form-row">
              <label>
                Type
                <select value={o.type} onChange={(e) => setOrder(i, 'type', e.target.value)}>
                  {Object.entries(ORDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Name<input value={o.name} maxLength={200} required onChange={(e) => setOrder(i, 'name', e.target.value)} placeholder="Throat swab" /></label>
            </div>
            <label>Instructions (optional)<input value={o.instructions} maxLength={1000} onChange={(e) => setOrder(i, 'instructions', e.target.value)} /></label>
            <button type="button" className="link-btn" onClick={() => setOrders(orders.filter((_, j) => j !== i))}>Remove test</button>
          </div>
        ))}
        {orders.length < 10 && (
          <button type="button" className="btn btn-ghost" onClick={() => setOrders([...orders, { ...EMPTY_ORDER }])}>+ Add test or referral</button>
        )}
      </fieldset>

      <button className="btn btn-lg" disabled={form.busy}>{form.busy ? 'Sending…' : 'Send advice and close case'}</button>
      {form.message}
    </form>
  );
}

/** Meeting: an in-person appointment with 1 to 4 times at one place. The patient picks one. */
function MeetingForm({ act }: { act: Act }) {
  const empty = { message: '', location: '', slots: ['', '', '', ''] };
  const [v, setV] = useState(empty);
  const form = useSubmit(
    () =>
      act('appointment', {
        message: v.message,
        location: v.location,
        // datetime-local has no time zone; new Date() reads it as the doctor's local time.
        slots: v.slots.filter(Boolean).map((s) => new Date(s).toISOString()),
      }),
    () => setV(empty),
  );
  const setSlot = (i: number, value: string) => setV({ ...v, slots: v.slots.map((s, j) => (j === i ? value : s)) });

  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <label>
        Message for the patient
        <textarea value={v.message} rows={3} maxLength={5000} required onChange={(e) => setV({ ...v, message: e.target.value })}
          placeholder="I would like to see you in person. Pick a time that works." />
      </label>
      <label>
        Location
        <input value={v.location} maxLength={200} required onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="ER fast track, room 2" />
      </label>
      <fieldset className="items">
        <legend>Times to offer (1 to 4, at least 15 minutes from now)</legend>
        <div className="form-row">
          {v.slots.map((s, i) => (
            <label key={i}>
              Time {i + 1}{i > 0 && <span className="muted small"> (optional)</span>}
              <input type="datetime-local" value={s} required={i === 0} onChange={(e) => setSlot(i, e.target.value)} />
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-lg" disabled={form.busy}>{form.busy ? 'Sending…' : 'Offer these meeting times'}</button>
      {form.message}
    </form>
  );
}

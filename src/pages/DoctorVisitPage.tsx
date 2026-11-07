import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { CTAS_LABELS, STATUS_LABELS, callApi, formatTime as time, type DoctorVisitDetail } from './doctorApi';

const SENDER_LABELS = { patient: 'Patient', ai: 'Intake assistant', doctor: 'Doctor' } as const;
const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;
const list = (items: string[] | undefined) => (items?.length ? items.join(', ') : 'None on file');

// What the doctor can do in each status (the server enforces the same rules).
const CAN_CLAIM = ['waiting_for_doctor', 'appointment_offered', 'appointment_booked'];
const CAN_REPLY = ['waiting_for_doctor', 'appointment_booked'];
const CAN_OFFER = ['waiting_for_doctor'];

type Tab = 'reply' | 'appointment' | 'escalate';
type Act = (action: string, body?: object) => Promise<string | null>;

/** One case in full, plus the doctor's actions on it. */
export function DoctorVisitPage() {
  const { id = '' } = useParams();
  const { getToken, doctor } = useAuth();
  const [detail, setDetail] = useState<DoctorVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/doctor/visits/${encodeURIComponent(id)}`;

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
    setDetail(null);
    void load();
    // Refresh when this case changes elsewhere, e.g. the patient books a time.
    return subscribeToUpdates({
      as: 'doctor',
      getToken,
      onEvent: (e) => {
        if (String(e.visitId) === id) void load();
      },
    });
  }, [load, getToken, id]);

  /** Sends an action, then reloads the case. Returns an error message for the form, or null. */
  const act: Act = useCallback(
    async (action, body = {}) => {
      try {
        await callApi(getToken, `${path}/${action}`, body);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Something went wrong.';
      } finally {
        await load();
      }
    },
    [getToken, path, load],
  );

  if (error && !detail) {
    return (
      <div className="doctor">
        <Link to="/doctor">← Patient queue</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!detail) return <p className="muted">Loading…</p>;

  const { visit, notes, history } = detail;
  const ctas = visit.confirmedCtas ?? visit.suggestedCtas;
  const holder = visit.assignedDoctor;
  const mine = holder?.id === doctor?.id;
  const workable = CAN_CLAIM.includes(visit.status);
  const canAct = workable && (!holder || mine);

  return (
    <div className="doctor">
      <Link to="/doctor">← Patient queue</Link>

      <div className="doctor-header">
        <div>
          <h1>{visit.complaint}</h1>
          <p className="muted">
            Patient {visit.patientId} · checked in {time(visit.startedAt)} · {STATUS_LABELS[visit.status] ?? visit.status}
          </p>
        </div>
        <span className={`ctas ctas-${ctas ?? 'none'}`}>{ctas ? `CTAS ${ctas} · ${CTAS_LABELS[ctas]}` : 'Not triaged'}</span>
      </div>

      {visit.redFlags.length > 0 && (
        <div className="card alert">
          <h3>Red flags</h3>
          <ul>{visit.redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      {workable && (
        <section className="card claim-bar">
          {!holder && (
            <>
              <span>Nobody has taken this case yet.</span>
              <ActionButton label="Take this case" busyLabel="Taking…" onClick={() => act('claim')} />
            </>
          )}
          {holder && mine && <span>✓ You are handling this case.</span>}
          {holder && !mine && <span>{holder.name} is handling this case. You can read it and add private notes.</span>}
        </section>
      )}

      {canAct && <ActionPanel act={act} status={visit.status} suggestedCtas={visit.suggestedCtas} />}

      <div className="doctor-grid">
        <div className="doctor-main">
          {visit.appointment && (
            <section className="card">
              <h2>In-person appointment</h2>
              <p>
                {visit.appointment.location} · {visit.appointment.doctorName} ·{' '}
                {visit.appointment.status === 'booked' ? 'booked' : 'waiting for the patient to pick a time'}
              </p>
              <ul className="slots">
                {visit.appointment.slots.map((s) => (
                  <li key={s.id} className={s.chosen ? 'chosen' : ''}>{time(s.startsAt)}{s.chosen && ' ✓ chosen'}</li>
                ))}
              </ul>
            </section>
          )}

          {visit.status === 'resolved' && (
            <section className="card">
              <h2>Outcome</h2>
              <dl className="qa">
                <div><dt>Diagnosis</dt><dd>{visit.diagnosis}</dd></div>
                <div>
                  <dt>Confirmed CTAS</dt>
                  <dd>{visit.confirmedCtas ?? '—'}{visit.ctasOverrideReason && ` (changed from ${visit.suggestedCtas}: ${visit.ctasOverrideReason})`}</dd>
                </div>
                <div><dt>Closed by</dt><dd>{visit.doctor?.name} · {time(visit.resolvedAt)}</dd></div>
              </dl>
            </section>
          )}

          <section className="card">
            <h2>Symptoms reported at check-in</h2>
            <p><strong>Main complaint:</strong> {visit.complaint}</p>
            {visit.premadeAnswers.length > 0 ? (
              <dl className="qa">
                {visit.premadeAnswers.map((qa, i) => <div key={i}><dt>{qa.question}</dt><dd>{qa.answer}</dd></div>)}
              </dl>
            ) : (
              <p className="muted">No check-in answers recorded.</p>
            )}
          </section>

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
            <h2>Conversation</h2>
            {visit.messages.length === 0 && <p className="muted">No messages yet.</p>}
            <ol className="chat">
              {visit.messages.map((m, i) => (
                <li key={i} className={`chat-msg from-${m.from}`}>
                  <span className="chat-meta">{SENDER_LABELS[m.from]} · {time(m.sentAt)}</span>
                  <span>{m.text}</span>
                </li>
              ))}
            </ol>
          </section>

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
            <h2>Private doctor notes</h2>
            <p className="muted small">Only doctors see these. Never shown to the patient or the AI.</p>
            {notes.map((n, i) => (
              <div key={i} className="past-visit">
                <span>{n.text}</span>
                <span className="muted small">{n.doctorName} · {time(n.writtenAt)}</span>
              </div>
            ))}
            <NoteForm act={act} />
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
    </div>
  );
}

function ActionButton({ label, busyLabel, onClick }: { label: string; busyLabel: string; onClick: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await onClick());
          setBusy(false);
        }}
      >
        {busy ? busyLabel : label}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** The doctor's answer to the case. Replying, offering a time or escalating also claims it. */
function ActionPanel({ act, status, suggestedCtas }: { act: Act; status: string; suggestedCtas: number | null }) {
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'reply', label: status === 'appointment_booked' ? 'Reply after the visit' : 'Reply', show: CAN_REPLY.includes(status) },
    { id: 'appointment', label: 'Offer in-person appointment', show: CAN_OFFER.includes(status) },
    { id: 'escalate', label: 'Escalate to triage', show: true },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(visible[0].id);
  const current = visible.some((t) => t.id === tab) ? tab : visible[0].id;

  return (
    <section className="card actions">
      {status === 'appointment_offered' && (
        <p className="muted">Waiting for the patient to pick an appointment time. You can still escalate.</p>
      )}
      <div className="tabs" role="tablist">
        {visible.map((t) => (
          <button key={t.id} role="tab" aria-selected={current === t.id} className={current === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {current === 'reply' && <ReplyForm act={act} suggestedCtas={suggestedCtas} />}
      {current === 'appointment' && <AppointmentForm act={act} />}
      {current === 'escalate' && <EscalateForm act={act} />}
    </section>
  );
}

/** Shared submit handling: shows the server's error, and clears the form on success. */
function useSubmit(send: () => Promise<string | null>, reset: () => void) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const error = await send();
    setBusy(false);
    setStatus(error ? { ok: false, text: error } : { ok: true, text: 'Saved.' });
    if (!error) reset();
  };
  const message: ReactNode = status && <p className={status.ok ? 'muted' : 'error'}>{status.text}</p>;
  return { busy, onSubmit, message };
}

function NoteForm({ act }: { act: Act }) {
  const [text, setText] = useState('');
  const form = useSubmit(() => act('notes', { text }), () => setText(''));
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <label>
        Add a private note
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} required />
      </label>
      <button className="btn" disabled={form.busy || !text.trim()}>{form.busy ? 'Saving…' : 'Save note'}</button>
      {form.message}
    </form>
  );
}

const EMPTY_RX = { medication: '', dose: '', frequency: '', duration: '', instructions: '' };
const EMPTY_ORDER = { type: 'lab', name: '', instructions: '' };
const isBlank = (row: Record<string, string>, skip: string[] = []) =>
  Object.entries(row).every(([k, v]) => skip.includes(k) || !v.trim());

/** The one reply: message, diagnosis, CTAS, and any prescriptions and tests, sent together. */
function ReplyForm({ act, suggestedCtas }: { act: Act; suggestedCtas: number | null }) {
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
      <p className="muted small">You reply once. This closes the case, so include everything the patient needs.</p>
      <label>
        Message for the patient
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
      <p className="muted small">More urgent than CTAS 4? Use “Escalate to triage” instead.</p>
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

      <button className="btn btn-lg" disabled={form.busy}>{form.busy ? 'Sending…' : 'Send reply and close case'}</button>
      {form.message}
    </form>
  );
}

/** In-person appointment: 1 to 4 times at one place. The patient picks one. */
function AppointmentForm({ act }: { act: Act }) {
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
      <button className="btn" disabled={form.busy}>{form.busy ? 'Sending…' : 'Offer these times'}</button>
      {form.message}
    </form>
  );
}

function EscalateForm({ act }: { act: Act }) {
  const [reason, setReason] = useState('');
  const form = useSubmit(() => act('escalate', { reason }), () => setReason(''));
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <p className="muted small">The patient will be told to go to the triage desk now. Use this for anything CTAS 1 to 3.</p>
      <label>
        Reason (for staff only)
        <input value={reason} maxLength={500} required onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="btn btn-danger" disabled={form.busy || !reason.trim()}>{form.busy ? 'Escalating…' : 'Escalate to triage'}</button>
      {form.message}
    </form>
  );
}

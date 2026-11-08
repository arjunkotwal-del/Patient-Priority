import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { subscribeToUpdates } from '../lib/live';
import { CTAS_LABELS, STATUS_LABELS, callApi, formatTime as time, type DoctorVisitDetail } from './doctorApi';
import { PRIORITY_LABELS } from './DoctorQueuePage';

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
      <div className="page">
        <Link to="/doctor" className="back">← Patient queue</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!detail) return <div className="page"><p className="muted">Loading…</p></div>;

  const { visit, notes, history } = detail;
  const ctas = visit.confirmedCtas ?? visit.suggestedCtas;
  const holder = visit.assignedDoctor;
  const mine = holder?.id === doctor?.id;
  const workable = CAN_CLAIM.includes(visit.status);
  const canAct = workable && (!holder || mine);

  return (
    <div className="page page-wide">
      <Link to="/doctor" className="back">← Patient queue</Link>

      <div className="work-head">
        <div>
          <span className="eyebrow">Case #{visit.id} · Patient {visit.patientId} · checked in {time(visit.startedAt)}</span>
          <h1>{visit.complaint}</h1>
        </div>
        <div className="row">
          {visit.priority && <span className={`chip chip-${visit.priority}`}>{PRIORITY_LABELS[visit.priority]}</span>}
          <span className="chip plain">{ctas ? `CTAS ${ctas} · ${CTAS_LABELS[ctas]}` : 'Not triaged'}</span>
          <span className={`status status-${visit.status}`}>{STATUS_LABELS[visit.status] ?? visit.status}</span>
        </div>
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
              <span className="muted">Nobody has taken this case yet.</span>
              <ActionButton label="Take this case" busyLabel="Taking…" onClick={() => act('claim')} />
            </>
          )}
          {holder && mine && <span><span className="dot dot-slate" aria-hidden="true" /> You are handling this case.</span>}
          {holder && !mine && <span className="muted">{holder.name} is handling this case. You can read it and add private notes.</span>}
        </section>
      )}

      <div className="work">
        {/* Left half: the patient's own words, in order. */}
        <section className="card work-chat">
          <div className="card-head">
            <h2>Intake conversation</h2>
            <span className="mono faint">{visit.messages.length} messages</span>
          </div>
          <ol className="chat-panel">
            <li className="chat-stamp">Checked in · {time(visit.startedAt)}</li>
            <li className="msg msg-patient">
              <span className="msg-icon" aria-hidden="true">Pt</span>
              <div className="msg-main">
                <div className="msg-head"><strong>Patient</strong><span className="msg-tag">Complaint</span></div>
                <div className="msg-body">{visit.complaint}</div>
              </div>
            </li>
            {visit.premadeAnswers.length > 0 && (
              <li className="card-inset">
                <dl className="qa">
                  {visit.premadeAnswers.map((qa, i) => <div key={i}><dt>{qa.question}</dt><dd>{qa.answer}</dd></div>)}
                </dl>
              </li>
            )}
            {visit.messages.map((m, i) => (
              <li key={i} className={`msg msg-${m.from}`}>
                <span className="msg-icon" aria-hidden="true">{m.from === 'patient' ? 'Pt' : m.from === 'doctor' ? 'Dr' : '+'}</span>
                <div className="msg-main">
                  <div className="msg-head">
                    <strong>{SENDER_LABELS[m.from]}</strong>
                    {m.from === 'ai' && <span className="msg-tag">AI</span>}
                    <span className="msg-time">{time(m.sentAt)}</span>
                  </div>
                  <div className="msg-body">{m.text}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Right half: four clinical panels, then the doctor's one answer. */}
        <div className="quads">
          <section className="card quad">
            <div className="quad-head"><h2>AI intake summary</h2><span className="eyebrow">For review</span></div>
            {visit.soap ? (
              <dl className="qa">
                <div><dt>Subjective</dt><dd>{visit.soap.subjective}</dd></div>
                <div><dt>Assessment</dt><dd>{visit.soap.assessment}</dd></div>
                <div><dt>Plan</dt><dd>{visit.soap.plan}</dd></div>
              </dl>
            ) : (
              <p className="muted">No summary yet. The patient may still be answering.</p>
            )}
            {visit.priorityReasons.length > 0 && (
              <div className="reasons">{visit.priorityReasons.map((r) => <span key={r} className="reason">{r}</span>)}</div>
            )}
            <p className="small faint">Written by the intake assistant. Not a diagnosis.</p>
          </section>

          <section className="card quad">
            <div className="quad-head"><h2>Patient history</h2><span className="eyebrow">On file</span></div>
            <dl className="qa">
              <div><dt>Allergies</dt><dd>{list(history?.allergies)}</dd></div>
              <div><dt>Current medications</dt><dd>{list(history?.currentMeds)}</dd></div>
              <div><dt>Conditions</dt><dd>{list(history?.conditions)}</dd></div>
            </dl>
            <span className="eyebrow">Past visits</span>
            {!history?.pastVisits.length && <p className="muted small">None on file.</p>}
            {history?.pastVisits.map((v, i) => (
              <div key={i} className="entry">
                <strong>{v.complaint}</strong>
                <span className="mono">{v.date}</span>
                {v.diagnosis && <span>Diagnosis: {v.diagnosis}</span>}
                {v.prescriptions?.length ? <span>Prescribed: {v.prescriptions.join(', ')}</span> : null}
                {v.plan && <span className="muted">{v.plan}</span>}
              </div>
            ))}
          </section>

          <section className="card quad">
            <div className="quad-head"><h2>Private notes</h2><span className="eyebrow">Doctors only</span></div>
            <p className="small faint">Never shown to the patient or the AI.</p>
            {notes.map((n, i) => (
              <div key={i} className="entry">
                <span>{n.text}</span>
                <span className="mono">{n.doctorName} · {time(n.writtenAt)}</span>
              </div>
            ))}
            <NoteForm act={act} />
          </section>

          <section className="card quad">
            <div className="quad-head"><h2>Outcome</h2><span className="eyebrow">This visit</span></div>
            {visit.appointment && (
              <div className="entry">
                <strong>In person · {visit.appointment.status === 'booked' ? 'booked' : 'waiting for the patient to pick'}</strong>
                <span>{visit.appointment.location} · {visit.appointment.doctorName}</span>
                {visit.appointment.slots.map((s) => (
                  <span key={s.id} className={s.chosen ? 'accent mono' : 'mono'}>{time(s.startsAt)}{s.chosen && ' · chosen'}</span>
                ))}
              </div>
            )}
            {visit.status === 'resolved' && (
              <dl className="qa">
                <div><dt>Diagnosis</dt><dd>{visit.diagnosis}</dd></div>
                <div>
                  <dt>Confirmed CTAS</dt>
                  <dd>{visit.confirmedCtas ?? '—'}{visit.ctasOverrideReason && ` (changed from ${visit.suggestedCtas}: ${visit.ctasOverrideReason})`}</dd>
                </div>
                <div><dt>Closed by</dt><dd>{visit.doctor?.name} · {time(visit.resolvedAt)}</dd></div>
              </dl>
            )}
            {visit.prescriptions.map((p, i) => (
              <div key={`rx${i}`} className="entry">
                <strong>℞ {p.medication} {p.dose}</strong>
                <span>{p.frequency} · {p.duration}{p.instructions && ` · ${p.instructions}`}</span>
                <span className="mono">{p.doctorName} · {time(p.prescribedAt)}</span>
              </div>
            ))}
            {visit.orders.map((o, i) => (
              <div key={`o${i}`} className="entry">
                <strong>{ORDER_LABELS[o.type]}: {o.name}</strong>
                {o.instructions && <span>{o.instructions}</span>}
                <span className="mono">{o.doctorName} · {time(o.orderedAt)}</span>
              </div>
            ))}
            {!visit.appointment && visit.status !== 'resolved' && !visit.prescriptions.length && !visit.orders.length && (
              <p className="muted small">Nothing sent yet. Reply, offer a time, or escalate below.</p>
            )}
          </section>

          {canAct && (
            <div className="quad-wide">
              <ActionPanel act={act} status={visit.status} suggestedCtas={visit.suggestedCtas} />
            </div>
          )}
        </div>
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
    <section className="card quad">
      <div className="quad-head"><h2>Your answer</h2><span className="eyebrow">Sent once</span></div>
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
          <button type="button" className="btn btn-secondary" onClick={() => setRxs([...rxs, { ...EMPTY_RX }])}>+ Add prescription</button>
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
          <button type="button" className="btn btn-secondary" onClick={() => setOrders([...orders, { ...EMPTY_ORDER }])}>+ Add test or referral</button>
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

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CTAS_LABELS, STATUS_LABELS, callApi, type DoctorVisitDetail } from './doctorApi';

const SENDER_LABELS = { patient: 'Patient', ai: 'Intake assistant', doctor: 'Doctor' } as const;
const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;
const OPEN = ['waiting_for_doctor', 'doctor_asked'];
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const list = (items: string[]) => (items.length ? items.join(', ') : 'None on file');

type Tab = 'ask' | 'prescribe' | 'order' | 'close';
const TABS: { id: Tab; label: string }[] = [
  { id: 'ask', label: 'Ask patient' },
  { id: 'prescribe', label: 'Prescribe' },
  { id: 'order', label: 'Order test / referral' },
  { id: 'close', label: 'Close case' },
];

/** One patient request in full, plus the doctor's actions on it. */
export function DoctorVisitPage() {
  const { id = '' } = useParams();
  const { getToken, doctor } = useAuth();
  const [detail, setDetail] = useState<DoctorVisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/doctor/visits/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    try {
      const body = await callApi<DoctorVisitDetail>(getToken, path);
      setDetail(body);
      setError(null);
      // Opening the request counts as reading the patient's messages.
      if (body.unreadForDoctor > 0) void callApi(getToken, `${path}/read`, 'POST').catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this request.');
    }
  }, [getToken, path]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  /** Sends an action, then reloads the case. Returns an error message for the form, or null. */
  const act = useCallback(
    async (action: string, body: object = {}): Promise<string | null> => {
      try {
        const res = await fetch(`/api${path}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const reply = await res.json().catch(() => null);
        await load();
        return res.ok ? null : (reply?.message ?? `Server error (${res.status})`);
      } catch (err) {
        return err instanceof Error ? err.message : 'Something went wrong.';
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

  const { visit, patient, notes } = detail;
  const ctas = visit.confirmedCtas ?? visit.suggestedCtas;
  const isOpen = OPEN.includes(visit.status);
  const holder = visit.assignedDoctor;
  const mine = holder?.id === doctor?.id;

  return (
    <div className="doctor">
      <Link to="/doctor">← Patient queue</Link>

      <div className="doctor-header">
        <div>
          <h1>{visit.complaint}</h1>
          <p className="muted">
            {patient.name ?? `Patient ${patient.id}`} · checked in {time(visit.startedAt)} · {STATUS_LABELS[visit.status]}
          </p>
        </div>
        <span className={`ctas ctas-${ctas ?? 'none'}`}>
          {ctas ? `CTAS ${ctas} · ${CTAS_LABELS[ctas]}` : 'Not triaged'}
        </span>
      </div>

      {visit.redFlags.length > 0 && (
        <div className="card alert">
          <h3>Red flags</h3>
          <ul>{visit.redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}

      {isOpen && (
        <section className="card claim-bar">
          {!holder && (
            <>
              <span>Nobody has taken this case yet.</span>
              <ClaimButton onClaim={() => act('claim')} />
            </>
          )}
          {holder && mine && <span>✓ You are handling this case.</span>}
          {holder && !mine && <span>{holder.name} is handling this case. You can read it and add private notes.</span>}
        </section>
      )}

      {isOpen && (!holder || mine) && <ActionPanel act={act} suggestedCtas={visit.suggestedCtas} />}

      <div className="doctor-grid">
        <div className="doctor-main">
          {visit.status === 'resolved' && (
            <section className="card">
              <h2>Outcome</h2>
              <dl className="qa">
                <div><dt>Diagnosis</dt><dd>{visit.diagnosis}</dd></div>
                <div><dt>Plan given to patient</dt><dd>{visit.plan}</dd></div>
                <div><dt>Confirmed CTAS</dt><dd>{visit.confirmedCtas ?? '—'}{visit.ctasOverrideReason && ` (changed from ${visit.suggestedCtas}: ${visit.ctasOverrideReason})`}</dd></div>
                <div><dt>Closed by</dt><dd>{visit.doctor?.name} · {time(visit.resolvedAt)}</dd></div>
              </dl>
            </section>
          )}

          <section className="card">
            <h2>Symptoms reported at check-in</h2>
            <p><strong>Main complaint:</strong> {visit.complaint}</p>
            {visit.premadeAnswers.length > 0 ? (
              <dl className="qa">
                {visit.premadeAnswers.map((qa, i) => (
                  <div key={i}><dt>{qa.question}</dt><dd>{qa.answer}</dd></div>
                ))}
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
                <div><dt>Objective</dt><dd>{visit.soap.objective}</dd></div>
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
              <h2>Prescriptions and orders</h2>
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
              <div><dt>Allergies</dt><dd>{list(patient.allergies)}</dd></div>
              <div><dt>Current medications</dt><dd>{list(patient.currentMeds)}</dd></div>
              <div><dt>Conditions</dt><dd>{list(patient.conditions)}</dd></div>
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
            <TextForm label="Add a private note" button="Save note" onSubmit={(text) => act('notes', { text })} />
          </section>

          <section className="card">
            <h2>Past visits</h2>
            {patient.pastVisits.length === 0 && <p className="muted">None on file.</p>}
            {patient.pastVisits.map((v, i) => (
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

type Act = (action: string, body?: object) => Promise<string | null>;

function ClaimButton({ onClaim }: { onClaim: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await onClaim());
          setBusy(false);
        }}
      >
        {busy ? 'Taking…' : 'Take this case'}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** The doctor's actions on an open case. The first action also claims the case. */
function ActionPanel({ act, suggestedCtas }: { act: Act; suggestedCtas: number | null }) {
  const [tab, setTab] = useState<Tab>('ask');
  return (
    <section className="card actions">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ask' && (
        <TextForm label="Question for the patient" button="Send question" onSubmit={(text) => act('questions', { text })} />
      )}
      {tab === 'prescribe' && <PrescribeForm act={act} />}
      {tab === 'order' && <OrderForm act={act} />}
      {tab === 'close' && <CloseForm act={act} suggestedCtas={suggestedCtas} />}
    </section>
  );
}

/** Shared submit handling: shows "Saved" or the server's error, and clears the form on success. */
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

function TextForm({ label, button, onSubmit }: { label: string; button: string; onSubmit: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState('');
  const form = useSubmit(() => onSubmit(text), () => setText(''));
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <label>
        {label}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} required />
      </label>
      <button className="btn" disabled={form.busy || !text.trim()}>{form.busy ? 'Sending…' : button}</button>
      {form.message}
    </form>
  );
}

function PrescribeForm({ act }: { act: Act }) {
  const empty = { medication: '', dose: '', frequency: '', duration: '', instructions: '' };
  const [rx, setRx] = useState(empty);
  const form = useSubmit(() => act('prescriptions', rx), () => setRx(empty));
  const field = (key: keyof typeof empty, label: string, placeholder: string, required = true) => (
    <label>
      {label}
      <input value={rx[key]} placeholder={placeholder} maxLength={200} required={required} onChange={(e) => setRx({ ...rx, [key]: e.target.value })} />
    </label>
  );
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <div className="form-row">
        {field('medication', 'Medication', 'Ibuprofen')}
        {field('dose', 'Dose', '400 mg')}
      </div>
      <div className="form-row">
        {field('frequency', 'Frequency', 'Every 8 hours as needed')}
        {field('duration', 'Duration', '5 days')}
      </div>
      {field('instructions', 'Instructions (optional)', 'Take with food.', false)}
      <button className="btn" disabled={form.busy}>{form.busy ? 'Saving…' : 'Add prescription'}</button>
      {form.message}
    </form>
  );
}

function OrderForm({ act }: { act: Act }) {
  const empty = { type: 'lab', name: '', instructions: '' };
  const [order, setOrder] = useState(empty);
  const form = useSubmit(() => act('orders', order), () => setOrder(empty));
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <div className="form-row">
        <label>
          Type
          <select value={order.type} onChange={(e) => setOrder({ ...order, type: e.target.value })}>
            {Object.entries(ORDER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Name
          <input value={order.name} placeholder="Complete blood count" maxLength={200} required onChange={(e) => setOrder({ ...order, name: e.target.value })} />
        </label>
      </div>
      <label>
        Instructions for the patient (optional)
        <input value={order.instructions} maxLength={4000} onChange={(e) => setOrder({ ...order, instructions: e.target.value })} />
      </label>
      <button className="btn" disabled={form.busy}>{form.busy ? 'Saving…' : 'Add order'}</button>
      {form.message}
    </form>
  );
}

function CloseForm({ act, suggestedCtas }: { act: Act; suggestedCtas: number | null }) {
  const empty = { diagnosis: '', plan: '', confirmedCtas: String(suggestedCtas ?? 4), ctasOverrideReason: '' };
  const [v, setV] = useState(empty);
  const changed = suggestedCtas != null && Number(v.confirmedCtas) !== suggestedCtas;
  const form = useSubmit(() => act('resolve', v), () => setV(empty));
  return (
    <form className="action-form" onSubmit={form.onSubmit}>
      <label>
        Diagnosis
        <input value={v.diagnosis} maxLength={200} required onChange={(e) => setV({ ...v, diagnosis: e.target.value })} />
      </label>
      <label>
        Plan for the patient (they will see this)
        <textarea value={v.plan} rows={4} maxLength={4000} required onChange={(e) => setV({ ...v, plan: e.target.value })} />
      </label>
      <label>
        Confirm CTAS level {suggestedCtas != null && <span className="muted small">(AI suggested {suggestedCtas})</span>}
        <select value={v.confirmedCtas} onChange={(e) => setV({ ...v, confirmedCtas: e.target.value })}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {CTAS_LABELS[n]}</option>)}
        </select>
      </label>
      {changed && (
        <label>
          Why are you changing the CTAS level?
          <input value={v.ctasOverrideReason} maxLength={4000} required onChange={(e) => setV({ ...v, ctasOverrideReason: e.target.value })} />
        </label>
      )}
      <button className="btn" disabled={form.busy}>{form.busy ? 'Closing…' : 'Send plan and close case'}</button>
      {form.message}
    </form>
  );
}

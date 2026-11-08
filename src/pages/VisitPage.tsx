import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { initials } from '../components/Icon';
import { notifyIfHidden, subscribeToUpdates } from '../lib/live';
import type { Message } from '../../lib/types.ts';
import { PATIENT_STATUS, TRIAGE_MESSAGE, callApi, formatClock, formatDate, formatSlot, type PatientVisitView, type StepResponse } from './patientApi';

const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;

/** One visit as a single consultation thread: the AI interview, then the doctor's one reply or appointment. */
export function VisitPage() {
  const { id = '' } = useParams();
  const { getToken } = useAuth();
  const [visit, setVisit] = useState<PatientVisitView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `/visits/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    try {
      const v = await callApi<PatientVisitView>(getToken, path);
      setVisit(v);
      setError(null);
      if (v.unreadCount > 0 && document.visibilityState === 'visible') void callApi(getToken, `${path}/read`, {}).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this visit.');
    }
  }, [getToken, path]);

  useEffect(() => {
    setVisit(null);
    void load();
    return subscribeToUpdates({
      as: 'patient',
      getToken,
      onConnect: () => void load(),
      onEvent: (e) => {
        if (String(e.visitId) === id) void load();
        if (e.reason === 'doctor_reply' || e.reason === 'appointment_offered') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
      },
    });
  }, [load, getToken, id]);

  if (error && !visit) {
    return (
      <div className="page page-narrow">
        <Link to="/visits" className="back">← Consultation</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!visit) return <div className="page page-narrow"><p className="muted">Loading…</p></div>;
  if (visit.status === 'escalated') return <TriageScreen />;

  return (
    <div className="page page-narrow">
      <Link to="/visits" className="back">← Consultation</Link>
      <section className="card welcome">
        <div>
          <span className="eyebrow">Consultation #{visit.id}</span>
          <h1>{visit.complaint}</h1>
          <div className="welcome-meta">
            <span className={`status status-${visit.status}`}>{PATIENT_STATUS[visit.status]}</span>
            <span className="mono faint">Started {formatDate(visit.startedAt)}</span>
          </div>
        </div>
        {visit.doctorName && <span className="on-duty"><span className="dot dot-slate" aria-hidden="true" />{visit.doctorName}</span>}
      </section>

      {visit.status === 'interviewing' ? (
        <Interview visit={visit} path={path} onStep={setVisit} reload={load} />
      ) : (
        <>
          <section className="card chat-panel">
            <span className="chat-stamp">Your answers · {formatDate(visit.startedAt)}</span>
            <Thread messages={visit.messages} doctorName={visit.doctorName} />
          </section>
          {visit.status === 'waiting_for_doctor' && <Waiting visit={visit} />}
          {visit.status === 'appointment_offered' && <AppointmentPicker visit={visit} path={path} onBooked={setVisit} reload={load} />}
          {visit.status === 'appointment_booked' && <Booked visit={visit} />}
          {visit.status === 'resolved' && <Plan visit={visit} />}
        </>
      )}

      <p className="disclaimer">
        <span><b>*</b> If you are experiencing a life-threatening emergency, call <strong>911</strong> immediately.</span>
        <span className="mono faint">AI intake · reviewed by a doctor</span>
      </p>
    </div>
  );
}

/** Shown on any red flag or AI failure. Nothing else: no reason, no diagnosis. */
function TriageScreen() {
  return (
    <div className="page">
      <div className="triage" role="alert">
        <div className="triage-icon" aria-hidden>!</div>
        <h1>{TRIAGE_MESSAGE}</h1>
        <p className="muted">Show this screen to the nurse at the desk.</p>
        <Link to="/visits" className="btn btn-secondary">Back to consultation</Link>
      </div>
    </div>
  );
}

function Bubble({ m, doctorName }: { m: Message; doctorName: string | null }) {
  const who = m.from === 'patient' ? 'You' : m.from === 'doctor' ? doctorName ?? 'Your doctor' : 'Intake assistant';
  return (
    <li className={`msg msg-${m.from}`}>
      <span className="msg-icon" aria-hidden="true">{m.from === 'patient' ? 'You' : m.from === 'doctor' ? initials(doctorName) : '+'}</span>
      <div className="msg-main">
        <div className="msg-head">
          <strong>{who}</strong>
          {m.from === 'ai' && <span className="msg-tag">AI</span>}
          {m.from === 'doctor' && <span className="msg-tag">Doctor</span>}
          <span className="msg-time">{formatClock(m.sentAt)}</span>
        </div>
        <div className="msg-body">{m.text}</div>
      </div>
    </li>
  );
}

function Thread({ messages, doctorName }: { messages: Message[]; doctorName: string | null }) {
  return (
    <ul className="stack" style={{ gap: '1.3rem' }}>
      {messages.map((m, i) => <Bubble key={i} m={m} doctorName={doctorName} />)}
    </ul>
  );
}

// ---- The AI interview ------------------------------------------------------

function Interview({ visit, path, onStep, reload }: { visit: PatientVisitView; path: string; onStep: (v: PatientVisitView) => void; reload: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const last = visit.messages.at(-1);
  const question = last?.from === 'ai' && last.kind === 'question' ? last : null;
  const options = question?.options ?? [];

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and React would treat it as a cleanup.
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visit.messages.length, sending]);

  const send = async (answer: string) => {
    const clean = answer.trim();
    if (!clean || sending) return; // one answer at a time: two taps would make two AI questions
    setSending(clean);
    setError(null);
    try {
      const step = await callApi<StepResponse>(getToken, `${path}/messages`, { text: clean });
      setText('');
      if (step.status === 'interviewing') {
        const now = new Date().toISOString();
        onStep({
          ...visit,
          messages: [
            ...visit.messages,
            { from: 'patient', kind: 'answer', text: clean, sentAt: now },
            { from: 'ai', kind: 'question', text: step.question.text, options: step.question.options, sentAt: now },
          ],
        });
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not send. Please try again.');
      await reload();
    } finally {
      setSending(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <>
      <section className="card chat-panel" aria-live="polite">
        <span className="chat-stamp">Private intake · about 4 to 8 questions</span>
        <Thread messages={visit.messages} doctorName={null} />
        {sending && (
          <ul className="stack" style={{ gap: '1.3rem' }}>
            <Bubble m={{ from: 'patient', kind: 'answer', text: sending }} doctorName={null} />
            <li className="msg msg-ai" aria-label="The assistant is thinking">
              <span className="msg-icon" aria-hidden="true">+</span>
              <div className="msg-body typing"><span /><span /><span /></div>
            </li>
          </ul>
        )}
        {question && !sending && options.length > 0 && (
          <div className="suggest">
            <span className="eyebrow">Tap an answer</span>
            <div className="choices">
              {options.map((o) => (
                <button key={o} type="button" className="choice" onClick={() => void send(o)}>{o}</button>
              ))}
            </div>
          </div>
        )}
        {!question && !sending && <p className="muted">Getting your next question…</p>}
        <div ref={endRef} />
      </section>

      {error && <p className="error">{error}</p>}
      <form className="composer" onSubmit={onSubmit}>
        <input
          value={text}
          maxLength={2000}
          disabled={!question || !!sending}
          autoFocus={options.length === 0}
          aria-label="Your answer"
          placeholder={options.length ? 'Or type your own answer…' : 'Type your answer…'}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn send" disabled={!text.trim() || !question || !!sending} aria-label="Send">↑</button>
      </form>
    </>
  );
}

// ---- After the interview ---------------------------------------------------

function Waiting({ visit }: { visit: PatientVisitView }) {
  return (
    <section className="card waiting">
      <div className="pulse" aria-hidden />
      <div className="stack-sm">
        <h2>Thanks. A doctor will review your answers and reply here.</h2>
        <p className="muted">
          You can close this page. If notifications are on, we'll let you know when they reply.
          {visit.doctorName && ` ${visit.doctorName} has your case.`}
        </p>
        <p className="small faint">If you start to feel worse, go to the triage desk.</p>
      </div>
    </section>
  );
}

function AppointmentPicker({ visit, path, onBooked, reload }: { visit: PatientVisitView; path: string; onBooked: (v: PatientVisitView) => void; reload: () => Promise<void> }) {
  const { getToken } = useAuth();
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appt = visit.appointment;
  if (!appt) return null;
  const upcoming = appt.slots.filter((s) => new Date(s.startsAt).getTime() > Date.now());

  const book = async () => {
    if (picked === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      onBooked(await callApi<PatientVisitView>(getToken, `${path}/appointment`, { slotId: picked }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That time could not be booked.');
      setPicked(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <div className="card-head"><h2>The doctor would like to see you in person</h2><span className="chip chip-high">Action needed</span></div>
      <p><span className="eyebrow">Where</span><br />{appt.location}</p>
      <div className="stack-sm" role="radiogroup" aria-label="Pick a time">
        <span className="eyebrow">Pick a time</span>
        {upcoming.length === 0 && <p className="muted">All of these times have passed. Please go to the triage desk.</p>}
        <div className="slots">
          {upcoming.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={picked === s.id} className={picked === s.id ? 'slot selected' : 'slot'} onClick={() => setPicked(s.id)}>
              {formatSlot(s.startsAt)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-lg" style={{ alignSelf: 'flex-start' }} disabled={picked === null || busy} onClick={() => void book()}>
        {busy ? 'Booking…' : 'Book this time'}
      </button>
    </section>
  );
}

function Booked({ visit }: { visit: PatientVisitView }) {
  const appt = visit.appointment;
  const slot = appt?.slots.find((s) => s.chosen);
  return (
    <section className="card stack-sm">
      <span className="eyebrow">You're booked</span>
      {slot && <p className="big-time">{formatSlot(slot.startsAt)}</p>}
      {appt && <p>{appt.location} · {appt.doctorName}</p>}
      <p className="small muted">Check in at the fast track desk when you arrive. Your plan will appear here after the visit.</p>
    </section>
  );
}

/** "Your plan": the diagnosis, prescriptions and tests from the doctor's one reply. */
function Plan({ visit }: { visit: PatientVisitView }) {
  return (
    <section className="card stack">
      <div className="card-head"><h2>Your care plan</h2><span className="chip chip-low">From {visit.doctorName ?? 'your doctor'}</span></div>
      {visit.diagnosis && (
        <div className="card-inset">
          <span className="eyebrow">What the doctor thinks it is</span>
          <p style={{ marginTop: '0.25rem' }}>{visit.diagnosis}</p>
        </div>
      )}
      {visit.prescriptions.length > 0 && (
        <div className="stack-sm">
          <span className="eyebrow">Prescriptions</span>
          <ul className="rx-list">
            {visit.prescriptions.map((p, i) => (
              <li key={i} className="rx">
                <strong>{p.medication} {p.dose}</strong>
                <span className="muted">{p.frequency}{p.duration && ` · for ${p.duration}`}</span>
                {p.instructions && <span className="small faint">{p.instructions}</span>}
              </li>
            ))}
          </ul>
          <p className="small faint">Pick these up at any pharmacy. Ask the pharmacist if you have questions.</p>
        </div>
      )}
      {visit.orders.length > 0 && (
        <div className="stack-sm">
          <span className="eyebrow">Tests and referrals</span>
          <ul className="rx-list">
            {visit.orders.map((o, i) => (
              <li key={i} className="rx">
                <strong>{ORDER_LABELS[o.type]}: {o.name}</strong>
                {o.instructions && <span className="muted">{o.instructions}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="emergency"><span><strong>Getting worse, or something new?</strong> Go to the triage desk, or call 911 in an emergency.</span></p>
    </section>
  );
}

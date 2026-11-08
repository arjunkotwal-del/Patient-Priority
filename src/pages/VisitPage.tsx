import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Bubble, ComposerCard, Composer, DoctorCard, Stamp, Suggestions, Typing } from '../components/Chat';
import { subscribeToUpdates } from '../lib/live';
import { callApi, patientStatus, formatDate, formatSlot, type PatientVisitView, type StepResponse } from './patientApi';
import { NotifyButton } from './VisitsPage';
import { VisitStatus } from '../components/VisitStatus';

const ORDER_LABELS = { lab: 'Lab test', imaging: 'Imaging', referral: 'Referral', other: 'Other' } as const;

/** What the doctor card at the bottom of the chat says for each status. */
const DOCTOR_LINE: Record<string, string> = {
  interviewing: 'Will review your answers once the questions are done',
  waiting_for_doctor: 'Reviewing your answers · They will reply here',
  appointment_offered: 'Would like to see you in person · Pick a time below',
  appointment_booked: 'Your in-person appointment is booked',
  resolved: 'Replied · Your care plan is below',
  escalated: 'Has an update for you · Check your doctor notifications',
};

/**
 * One visit as a single chat: the complaint, the check-in answers, the AI follow-ups, then the
 * doctor's one reply. The patient can only type during the AI interview.
 */
export function VisitPage() {
  const { id = '' } = useParams();
  const { getToken, user } = useAuth();
  const [visit, setVisit] = useState<PatientVisitView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
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
        // The portal shows the browser notification; this page just reloads its own visit.
        if (String(e.visitId) === id) void load();
      },
    });
  }, [load, getToken, id]);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and React would treat it as a cleanup.
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visit?.messages.length, visit?.status, sending]);

  if (error && !visit) {
    return (
      <div className="sc-page">
        <Link to="/visits" className="back">← Main chat</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!visit) return <div className="sc-page"><p className="muted">Loading…</p></div>;

  const interviewing = visit.status === 'interviewing';
  const last = visit.messages.at(-1);
  const question = interviewing && last?.from === 'ai' && last.kind === 'question' ? last : null;

  // One answer at a time: two taps would make two AI questions.
  const send = async (answer: string) => {
    if (sending || !question) return;
    setSending(answer);
    setSendError(null);
    try {
      const step = await callApi<StepResponse>(getToken, `${path}/messages`, { text: answer });
      if (step.status === 'interviewing') {
        const now = new Date().toISOString();
        setVisit({
          ...visit,
          messages: [
            ...visit.messages,
            { from: 'patient', kind: 'answer', text: answer, sentAt: now },
            { from: 'ai', kind: 'question', text: step.question.text, options: step.question.options, sentAt: now },
          ],
        });
      } else {
        await load();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'That did not send. Please try again.');
      await load();
    } finally {
      setSending(null);
    }
  };

  // The server stores the complaint as the first patient message; the check-in answers follow it.
  const [first, ...rest] = visit.messages;
  const startsWithComplaint = first?.from === 'patient' && first.text === visit.complaint;
  const afterCheckIn = startsWithComplaint ? rest : visit.messages;

  return (
    <div className="sc-full">
      <div className="sc-scroll" aria-live="polite">
        <div className="sc-column">
          <div className="sc-visit-title">
            <span className="sc-label">Visit #{visit.id} · started {formatDate(visit.startedAt)}</span>
            <h1>{visit.complaint}</h1>
            <VisitStatus status={visit.status} doctorName={visit.doctorName} />
          </div>
          <Stamp>Private consultation · {formatDate(visit.startedAt)}</Stamp>
          <ul className="sc-thread">
            <Bubble from="patient" text={visit.complaint} time={startsWithComplaint ? first.sentAt : visit.startedAt} patientName={user?.name} />
            {visit.premadeAnswers.map((qa, i) => (
              <li key={`qa${i}`} className="thread-pair">
                <ul>
                  <Bubble from="ai" text={qa.question} />
                  <Bubble from="patient" text={qa.answer} patientName={user?.name} />
                </ul>
              </li>
            ))}
            {afterCheckIn.map((m, i) => (
              <Bubble key={i} from={m.from} text={m.text} time={m.sentAt} patientName={user?.name} doctorName={visit.doctorName} />
            ))}
            {sending && <Bubble from="patient" text={sending} patientName={user?.name} pending />}
            {sending && <Typing />}
            {question && !sending && <Suggestions options={question.options ?? []} onPick={(o) => void send(o)} />}
            {interviewing && !question && !sending && <Typing />}
            <DoctorCard
              name={visit.doctorName ?? 'Doctor on duty'}
              line={DOCTOR_LINE[patientStatus(visit.status, visit.doctorName).key]}
              action={visit.status === 'waiting_for_doctor' || interviewing ? <NotifyButton /> : undefined}
            />
          </ul>
          {sendError && <p className="error">{sendError}</p>}
          {visit.status === 'appointment_offered' && <AppointmentPicker visit={visit} path={path} onBooked={setVisit} reload={load} />}
          {visit.status === 'appointment_booked' && <Booked visit={visit} />}
          {visit.status === 'resolved' && <Plan visit={visit} />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="sc-column sc-bottom">
        {interviewing ? (
          <Composer
            autoFocus
            disabled={!question || !!sending}
            onSend={(t) => void send(t)}
            placeholder={question?.options?.length ? 'Tap a suggested answer, or type your own…' : 'Type your answer…'}
          />
        ) : (
          <ClosedChat replied={patientStatus(visit.status, visit.doctorName).key !== 'waiting_for_doctor'} />
        )}
      </div>
    </div>
  );
}

// ---- After the interview ---------------------------------------------------

/**
 * Where the message box was. Once the interview ends the patient can't send anything more on this
 * visit (the server refuses it too), so a new problem means a new visit.
 */
function ClosedChat({ replied }: { replied: boolean }) {
  return (
    <ComposerCard>
      <div className="sc-closed" role="status">
        <span>{replied ? 'The doctor has replied, so this chat is closed.' : 'Your answers are with the doctor. This chat is closed while they review.'}</span>
        <Link to="/visits" className="sc-doctor-btn">Start a new visit</Link>
      </div>
    </ComposerCard>
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
      {appt.description && <p className="pre-wrap"><span className="eyebrow">About this appointment</span><br />{appt.description}</p>}
      <div className="stack-sm" role="radiogroup" aria-label="Pick a time">
        <span className="eyebrow">Pick a time</span>
        {upcoming.length === 0 && <p className="muted">All of these times have passed.</p>}
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
      {appt?.description && <p className="pre-wrap">{appt.description}</p>}
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
    </section>
  );
}

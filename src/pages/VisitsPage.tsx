import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Bubble, Composer, Suggestions, Typing } from '../components/Chat';
import { initials } from '../components/Icon';
import { askNotificationPermission, notifyIfHidden, subscribeToUpdates } from '../lib/live';
import { PREMADE_QUESTIONS } from '../../lib/premadeQuestions.ts';
import { OPEN_STATUSES, PATIENT_STATUS, callApi, formatDate, type MyVisits, type StepResponse, type VisitSummary } from './patientApi';

const GREETING = "Hi! What's bothering you today? A doctor will review your answers and reply here.";
const QUICK_STARTS = ['Sore throat', 'Ear pain', 'Sprained ankle', 'Rash'];
const SKIP = 'Skip';

/** Loads the patient's visits and keeps them fresh. Shared by Main chat and History. */
export function useMyVisits() {
  const { getToken } = useAuth();
  const [data, setData] = useState<MyVisits | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await callApi<MyVisits>(getToken, '/me/visits'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your visits.');
    }
  }, [getToken]);

  useEffect(() => {
    void load();
    return subscribeToUpdates({
      as: 'patient',
      getToken,
      onConnect: () => void load(),
      onEvent: (e) => {
        void load();
        if (e.reason === 'doctor_reply' || e.reason === 'appointment_offered') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
      },
    });
  }, [load, getToken]);

  return { data, error };
}

/**
 * Main chat: a new consultation. The patient describes the problem, then answers the set check-in
 * questions one by one in the chat. Then the visit is created and the AI follow-ups carry on
 * in the same chat on the visit's own page.
 */
export function VisitsPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const { data, error } = useMyVisits();
  const [notify, setNotify] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  const [complaint, setComplaint] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const open = data?.visits.filter((v) => OPEN_STATUSES.includes(v.status)) ?? [];
  const firstName = user?.name?.split(/[\s@]/)[0];
  const question = complaint !== null ? PREMADE_QUESTIONS[answers.length] : undefined;
  const done = complaint !== null && !question;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [complaint, answers.length, starting]);

  // After the last set question, create the visit; the AI's first follow-up is waiting on its page.
  const start = useCallback(async () => {
    if (complaint === null) return;
    setStarting(true);
    setStartError(null);
    try {
      const premadeAnswers = answers.filter((a) => a.answer !== SKIP);
      const step = await callApi<StepResponse>(getToken, '/visits', { complaint, premadeAnswers });
      navigate(`/visits/${step.visitId}`, { replace: true });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStarting(false);
    }
  }, [answers, complaint, getToken, navigate]);

  useEffect(() => {
    if (done && !starting && !startError) void start();
  }, [done, starting, startError, start]);

  const send = (text: string) => {
    if (complaint === null) setComplaint(text);
    else if (question) setAnswers((a) => [...a, { question: question.text, answer: text }]);
  };

  return (
    <div className="page page-narrow">
      <section className="card welcome">
        <div className="row">
          <span className="avatar avatar-lg" aria-hidden="true">{initials(user?.name)}</span>
          <div>
            <h1>Welcome back{firstName ? `, ${firstName}` : ''}</h1>
            <div className="welcome-meta">
              <span className="chip chip-low">Virtual fast track</span>
              <span className="mono faint">Minor problems · CTAS 4 and 5</span>
            </div>
          </div>
        </div>
        <span className="on-duty"><span className="dot dot-slate" aria-hidden="true" />A doctor replies here</span>
      </section>

      {open.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Open visits</h2><span className="mono faint">{open.length}</span></div>
          <VisitList visits={open} />
        </section>
      )}

      {notify === 'default' && (
        <div className="card spread">
          <span className="muted">Get a notification when your doctor replies.</span>
          <button className="btn btn-secondary" onClick={async () => { await askNotificationPermission(); setNotify(Notification.permission); }}>Turn on</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <section className="card chat-panel" aria-live="polite">
        <span className="chat-stamp">New consultation · {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</span>
        <ul className="thread">
          <Bubble from="ai" text={GREETING} />
          {complaint === null && <Suggestions label="Start with" options={QUICK_STARTS} onPick={send} />}
          {complaint !== null && <Bubble from="patient" text={complaint} />}
          {answers.map((a, i) => (
            <li key={i} className="thread-pair">
              <ul className="thread">
                <Bubble from="ai" text={a.question} />
                <Bubble from="patient" text={a.answer} />
              </ul>
            </li>
          ))}
          {question && (
            <>
              <Bubble from="ai" text={answers.length === 0 ? `Thanks. A few quick questions first. ${question.text}` : question.text} />
              <Suggestions options={[...(question.choices ?? []), SKIP]} onPick={send} />
            </>
          )}
          {done && !startError && <Typing />}
        </ul>
        {startError && (
          <div className="stack-sm">
            <p className="error">{startError}</p>
            <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => void start()}>Try again</button>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <Composer
        autoFocus
        disabled={done}
        onSend={send}
        placeholder={complaint === null ? 'Describe your symptoms in your own words…' : question?.choices ? 'Tap an answer above, or type your own…' : 'Type your answer…'}
      />
    </div>
  );
}

export function VisitList({ visits }: { visits: VisitSummary[] }) {
  return (
    <ul className="visit-list">
      {visits.map((v) => (
        <li key={v.id}>
          <Link to={`/visits/${v.id}`} className="visit-row">
            <span className="grow">
              <strong>{v.complaint}</strong>
              <span className="mono">{formatDate(v.startedAt)}{v.doctorName && ` · ${v.doctorName}`}</span>
            </span>
            {v.unreadCount > 0 && <span className="badge">{v.unreadCount}</span>}
            <span className={`status status-${v.status}`}>{PATIENT_STATUS[v.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

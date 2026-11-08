import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Bubble, Composer, Stamp, Suggestions, Typing } from '../components/Chat';
import { Icon } from '../components/Icon';
import { askNotificationPermission, notifyIfHidden, subscribeToUpdates } from '../lib/live';
import { PREMADE_QUESTIONS } from '../../lib/premadeQuestions.ts';
import { PATIENT_STATUS, callApi, formatClock, formatDate, type MyVisits, type StepResponse, type VisitSummary } from './patientApi';

const GREETING = "Hi! What's bothering you today? A doctor will review your answers and reply here.";
const QUICK_STARTS = ['Sore throat', 'Ear pain', 'Sprained ankle', 'Rash'];
const SKIP = 'Skip';

/** The name to greet the patient by: their first name, or the start of their email. */
export function displayName(name?: string | null) {
  return name?.split(/[\s@]/)[0] ?? '';
}

/** Loads the patient's visits and keeps them fresh. Shared by the portal pages. */
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

/** Lets the patient turn on browser notifications from the doctor card. */
export function NotifyButton() {
  const [state, setState] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));
  if (state !== 'default') return null;
  return (
    <button type="button" className="sc-doctor-btn" onClick={async () => { await askNotificationPermission(); setState(Notification.permission); }}>
      <Icon name="notifications_active" size={16} />Notify me
    </button>
  );
}

/**
 * Main chat: a new consultation. The patient describes the problem, then answers the set check-in
 * questions one by one in the chat. Then the visit is created and the AI follow-ups carry on
 * in the same chat on the visit's own page.
 */
export function VisitsPage() {
  const { user, getToken } = useAuth();
  const navigate = useNavigate();
  const { error } = useMyVisits();
  const [complaint, setComplaint] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string; at: string }[]>([]);
  const [complaintAt, setComplaintAt] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [openedAt] = useState(() => new Date().toISOString());
  const endRef = useRef<HTMLDivElement>(null);

  const name = displayName(user?.name);
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
      const premadeAnswers = answers.filter((a) => a.answer !== SKIP).map(({ question, answer }) => ({ question, answer }));
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
    const at = new Date().toISOString();
    if (complaint === null) {
      setComplaint(text);
      setComplaintAt(at);
    } else if (question) {
      setAnswers((a) => [...a, { question: question.text, answer: text, at }]);
    }
  };

  // Before the patient says anything: a centred greeting and a big message box.
  if (complaint === null) {
    return (
      <div className="sc-full sc-full-hero">
        <div className="sc-hero">
          <h1 className="sc-greet">
            <Icon name="neurology" size={40} className="sc-greet-icon" />
            {timeOfDay()}{name ? `, ${name}` : ''}
          </h1>
          <p className="sc-hero-sub">{GREETING}</p>
          <Composer autoFocus onSend={send} placeholder="Describe your symptoms in your own words…" />
          <div className="sc-hero-chips">
            {QUICK_STARTS.map((c) => (
              <button key={c} type="button" className="sc-chip" onClick={() => send(c)}>
                <Icon name="add_circle" size={16} className="sc-tertiary" />
                <span>{c}</span>
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="sc-full">
      <div className="sc-scroll" aria-live="polite">
        <div className="sc-column">
          <Stamp>Private consultation · Today {formatClock(openedAt)}</Stamp>
          <ul className="sc-thread">
            <Bubble from="ai" text={GREETING} time={openedAt} />
            <Bubble from="patient" text={complaint} time={complaintAt} patientName={user?.name} />
            {answers.map((a, i) => (
              <li key={i} className="thread-pair">
                <ul>
                  <Bubble from="ai" text={a.question} />
                  <Bubble from="patient" text={a.answer} time={a.at} patientName={user?.name} />
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
              <button className="sc-doctor-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void start()}>Try again</button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="sc-column sc-bottom">
        <Composer
          autoFocus
          disabled={done}
          onSend={send}
          placeholder={question?.choices ? 'Tap a suggested answer, or type your own…' : 'Type your answer…'}
        />
      </div>
    </div>
  );
}

/** "Morning", "Afternoon" or "Evening", from the patient's own clock. */
function timeOfDay() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
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

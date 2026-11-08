import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PREMADE_QUESTIONS } from '../../lib/premadeQuestions.ts';
import { callApi, type StepResponse } from './patientApi';

/** Step one: the patient's own words plus the set check-in questions. Only the description is required. */
export function NewVisitPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const start = (useLocation().state as { complaint?: string } | null)?.complaint ?? '';
  const [complaint, setComplaint] = useState(start);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !complaint.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const premadeAnswers = PREMADE_QUESTIONS.filter((q) => answers[q.id]?.trim()).map((q) => ({ question: q.text, answer: answers[q.id].trim() }));
      const step = await callApi<StepResponse>(getToken, '/visits', { complaint: complaint.trim(), premadeAnswers });
      navigate(`/visits/${step.visitId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const set = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }));

  return (
    <form className="page page-narrow" onSubmit={onSubmit}>
      <Link to="/visits" className="back">← Consultation</Link>
      <div>
        <span className="eyebrow">New consultation</span>
        <h1>What's bothering you?</h1>
      </div>

      <section className="card stack">
        <label>
          Tell us in your own words
          <textarea
            rows={3}
            maxLength={2000}
            required
            autoFocus
            placeholder="For example: my throat has been really sore since Tuesday"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
          />
        </label>
      </section>

      <fieldset className="card">
        <legend>A few quick questions</legend>
        <p className="mono faint" style={{ marginBottom: '0.75rem' }}>Skip any you're not sure about</p>
        {PREMADE_QUESTIONS.map((q, i) => (
          // Not a <label> for choice questions: tapping the text would pick the first answer.
          <div key={q.id} className="intake-q" role="group" aria-labelledby={`q-${q.id}`}>
            <span id={`q-${q.id}`}><span className="mono">{String(i + 1).padStart(2, '0')}</span>{q.text}</span>
            {q.choices ? (
              <div className="choices" role="radiogroup" aria-labelledby={`q-${q.id}`}>
                {q.choices.map((c) => (
                  <button
                    type="button"
                    key={c}
                    role="radio"
                    aria-checked={answers[q.id] === c}
                    className={answers[q.id] === c ? 'choice selected' : 'choice'}
                    onClick={() => set(q.id, answers[q.id] === c ? '' : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <input aria-labelledby={`q-${q.id}`} maxLength={500} value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)} />
            )}
          </div>
        ))}
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className="spread">
        <button className="btn btn-lg" disabled={busy || !complaint.trim()}>{busy ? 'Starting…' : 'Continue to follow-up questions →'}</button>
        <span className="muted small">If you feel very unwell, go to the triage desk now.</span>
      </div>
    </form>
  );
}

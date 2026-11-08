// Shared pieces of the patient's consultation chat (the Stitch "Main chat" screen).
import { useState, type FormEvent, type ReactNode } from 'react';
import { initials } from './Icon';
import { formatClock } from '../pages/patientApi';

export type Who = 'ai' | 'patient' | 'doctor';

/** One chat bubble. */
export function Bubble({ from, text, time, doctorName, pending }: { from: Who; text: string; time?: string; doctorName?: string | null; pending?: boolean }) {
  const name = from === 'patient' ? 'You' : from === 'doctor' ? doctorName ?? 'Your doctor' : 'Intake assistant';
  return (
    <li className={`msg msg-${from}${pending ? ' pending' : ''}`}>
      <span className="msg-icon" aria-hidden="true">{from === 'patient' ? 'You' : from === 'doctor' ? initials(doctorName) : '+'}</span>
      <div className="msg-main">
        <div className="msg-head">
          <strong>{name}</strong>
          {from === 'ai' && <span className="msg-tag">AI intake</span>}
          {from === 'doctor' && <span className="msg-tag">Doctor</span>}
          {time && <span className="msg-time">{formatClock(time)}</span>}
        </div>
        <div className="msg-body">{text}</div>
        {from === 'patient' && !pending && <span className="delivered">✓ Sent</span>}
      </div>
    </li>
  );
}

/** The "assistant is thinking" bubble. */
export function Typing() {
  return (
    <li className="msg msg-ai" aria-label="The assistant is thinking">
      <span className="msg-icon" aria-hidden="true">+</span>
      <div className="msg-body typing"><span /><span /><span /></div>
    </li>
  );
}

/** Tap-to-answer chips under the latest question. */
export function Suggestions({ label = 'Tap an answer', options, onPick, disabled }: { label?: string; options: string[]; onPick: (o: string) => void; disabled?: boolean }) {
  if (options.length === 0) return null;
  return (
    <li className="suggest">
      <span className="eyebrow">{label}</span>
      <div className="choices">
        {options.map((o) => (
          <button key={o} type="button" className="choice" disabled={disabled} onClick={() => onPick(o)}>{o}</button>
        ))}
      </div>
    </li>
  );
}

/** The message box at the bottom, with the emergency line under it. */
export function Composer({ placeholder, disabled, onSend, autoFocus }: { placeholder: string; disabled?: boolean; onSend: (text: string) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || disabled) return;
    onSend(clean);
    setText('');
  };
  return (
    <ComposerCard>
      <form className="composer" onSubmit={submit}>
        <input value={text} maxLength={2000} disabled={disabled} autoFocus={autoFocus} aria-label="Your message" placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        <button className="btn send" disabled={disabled || !text.trim()} aria-label="Send">↑</button>
      </form>
    </ComposerCard>
  );
}

export function ComposerCard({ children }: { children: ReactNode }) {
  return (
    <div className="card composer-card">
      {children}
      <p className="disclaimer">
        <span><b>*</b> If you are experiencing a life-threatening emergency, call <strong>911</strong> immediately.</span>
        <span className="mono faint">AI intake · reviewed by a doctor</span>
      </p>
    </div>
  );
}

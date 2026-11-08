// The patient's consultation chat, built to match the Stitch "Main chat" screen.
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, initials } from './Icon';
import { formatClock } from '../pages/patientApi';

export type Who = 'ai' | 'patient' | 'doctor';

/** The welcome / visit header card: avatar, title, a chip, a sub line, and the attending box on the right. */
export function HeaderCard({ name, title, chip, sub, attending, attendingSub }: {
  name?: string | null; title: string; chip?: string; sub?: string; attending: string; attendingSub: string;
}) {
  return (
    <section className="sc-header">
      <div className="sc-header-left">
        <span className="sc-avatar">{initials(name)}<span className="sc-avatar-dot" /></span>
        <div>
          <div className="sc-header-title">
            <h1>{title}</h1>
            {chip && <span className="sc-pid">{chip}</span>}
          </div>
          {sub && <p className="sc-header-sub"><span className="sc-sub-dot" /><span>{sub}</span></p>}
        </div>
      </div>
      <div className="sc-attending">
        <span className="sc-pulse" />
        <div>
          <div className="sc-attending-line">
            <span className="sc-label">Attending:</span>
            <strong>{attending}</strong>
            <Icon name="verified" size={14} className="sc-secondary" />
          </div>
          <span className="sc-label sc-secondary">{attendingSub}</span>
        </div>
      </div>
    </section>
  );
}

/** The "Encrypted channel" style pill at the top of the chat. */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <div className="sc-stamp-row">
      <span className="sc-stamp"><Icon name="lock_clock" size={14} className="sc-tertiary" />{children}</span>
    </div>
  );
}

/** One chat message. */
export function Bubble({ from, text, time, patientName, doctorName, pending }: {
  from: Who; text: string; time?: string; patientName?: string | null; doctorName?: string | null; pending?: boolean;
}) {
  if (from === 'patient') {
    return (
      <li className={`sc-msg sc-msg-me${pending ? ' sc-pending' : ''}`}>
        <span className="sc-me-avatar">{initials(patientName)}</span>
        <div className="sc-msg-col sc-msg-col-me">
          <div className="sc-msg-head">
            {time && <span className="sc-label">{formatClock(time)}</span>}
            <span className="sc-name">{patientName || 'You'}</span>
          </div>
          <div className="sc-bubble sc-bubble-me">{text}</div>
          {!pending && <span className="sc-delivered"><Icon name="done_all" size={14} />Delivered to care team</span>}
        </div>
      </li>
    );
  }
  const doctor = from === 'doctor';
  return (
    <li className="sc-msg">
      <span className={`sc-ai-avatar${doctor ? ' sc-doc-avatar' : ''}`}>
        {doctor ? initials(doctorName) : <Icon name="neurology" size={20} />}
      </span>
      <div className="sc-msg-col">
        <div className="sc-msg-head">
          <span className="sc-name">{doctor ? doctorName ?? 'Your doctor' : 'PatientPriority AI'}</span>
          <span className="sc-tag">{doctor ? 'Attending doctor' : 'Intake assistant'}</span>
          {time && <span className="sc-label">{formatClock(time)}</span>}
        </div>
        <div className="sc-bubble">{text}</div>
      </div>
    </li>
  );
}

/** The "thinking" message while the AI works on its next question. */
export function Typing() {
  return (
    <li className="sc-msg" aria-label="The assistant is thinking">
      <span className="sc-ai-avatar"><Icon name="neurology" size={20} /></span>
      <div className="sc-bubble sc-typing"><span /><span /><span /></div>
    </li>
  );
}

// The Stitch chips alternate gold, peach and blue icons.
const CHIP_ICONS = [
  { name: 'check_circle', tone: 'sc-tertiary' },
  { name: 'check_circle', tone: 'sc-primary' },
  { name: 'check_circle', tone: 'sc-secondary' },
];

/** "Suggested clinical actions": tap-to-answer chips under the latest question. */
export function Suggestions({ label = 'Suggested answers', options, onPick, disabled }: {
  label?: string; options: string[]; onPick: (o: string) => void; disabled?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <li className="sc-chips">
      <span className="sc-label">{label}</span>
      <div className="sc-chip-row">
        {options.map((o, i) => {
          const icon = CHIP_ICONS[i % CHIP_ICONS.length];
          return (
            <button key={o} type="button" className="sc-chip" disabled={disabled} onClick={() => onPick(o)}>
              <Icon name={icon.name} size={16} className={icon.tone} />
              <span>{o}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** The doctor presence card at the bottom of the chat. */
export function DoctorCard({ name, line, action }: { name: string; line: string; action?: ReactNode }) {
  return (
    <li className="sc-doctor">
      <div className="sc-doctor-left">
        <span className="sc-doctor-avatar"><Icon name="stethoscope" size={20} /></span>
        <div>
          <div className="sc-doctor-name"><strong>{name}</strong><span className="sc-doctor-dot" /></div>
          <span className="sc-doctor-line">{line}</span>
        </div>
      </div>
      {action}
    </li>
  );
}

/** The message bar: a two-line box and the send button. Enter sends, Shift+Enter adds a line. */
export function Composer({ placeholder, disabled, onSend, autoFocus }: { placeholder: string; disabled?: boolean; onSend: (text: string) => void; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const clean = text.trim();
    if (!clean || disabled) return;
    onSend(clean);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <ComposerCard>
      <form className="sc-input" onSubmit={submit}>
        <textarea
          rows={2}
          value={text}
          maxLength={2000}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label="Your message"
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="sc-send" disabled={disabled || !text.trim()} aria-label="Send" title="Send">
          <Icon name="arrow_upward" size={20} />
        </button>
      </form>
    </ComposerCard>
  );
}

/** The card around the message bar, with the safety line under it. */
export function ComposerCard({ children }: { children: ReactNode }) {
  return (
    <div className="sc-composer">
      {children}
      <div className="sc-foot">
        <span className="sc-foot-left">
          <Icon name="emergency" size={16} className="sc-error" />
          <span>If you are experiencing a life-threatening emergency, call <strong>911</strong> immediately.</span>
        </span>
        <span className="sc-label">AI intake supervised by the attending doctor</span>
      </div>
    </div>
  );
}

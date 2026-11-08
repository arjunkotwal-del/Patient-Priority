import { BrandLogo } from '../components/BrandLogo';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/**
 * Doctors' own login: an existing email and password only. There is no sign-up;
 * doctor accounts are created by the clinic with npm run doctor:add.
 */
export function DoctorLoginPage() {
  const { doctorLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the session is set and the route guard sends the doctor to the queue.
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await doctorLogin(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in.');
      setBusy(false);
    }
  };

  return (
    <div className="auth-page login-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Link to="/" className="auth-back">← Back to Patient Priority</Link>
      <aside className="auth-intro">
        <p className="eyebrow">PATIENT PRIORITY · CLINICIANS</p>
        <h2>The patient queue,<br />most urgent first.</h2>
        <p>Open the case at the front of the queue, then give advice or schedule an in-person meeting.</p>
        <div className="auth-help">
          <strong>No account yet?</strong>
          <p>Doctor accounts are set up by the clinic. Ask your administrator for your email and password.</p>
        </div>
      </aside>
      <main className="auth-card" id="main-content">
        <BrandLogo />
        <p className="eyebrow">DOCTOR LOGIN</p>
        <h1>Doctor login</h1>
        <p className="muted">Log in with the email and password the clinic gave you.</p>
        <form className="action-form" onSubmit={onSubmit}>
          <label>
            Email
            <input type="email" autoComplete="username" value={email} required maxLength={320} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} required maxLength={200} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-lg" disabled={busy || !email.trim() || !password}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-footnote">
          Looking for your patient account? <Link to="/login">Patient login</Link>
        </p>
      </main>
    </div>
  );
}

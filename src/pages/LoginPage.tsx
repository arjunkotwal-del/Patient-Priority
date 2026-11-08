import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, signup, error } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/home';
  const [pending, setPending] = useState<'login' | 'signup' | null>(null);

  const go = (mode: 'login' | 'signup') => {
    setPending(mode);
    (mode === 'login' ? login : signup)(from).catch(() => setPending(null));
  };

  return (
    <div className="auth-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <main className="auth-card" id="main-content">
        <Link to="/" className="back">← Back</Link>
        <span className="logo" aria-hidden="true">+</span>
        <div>
          <span className="eyebrow">Patients and clinicians</span>
          <h1>Welcome back</h1>
        </div>
        <p className="muted">Log in to continue. New patients will scan their Ontario health card once after signing up.</p>
        {error && <p className="error" role="alert">{error.message}</p>}
        <button className="btn btn-lg btn-block" onClick={() => go('login')} disabled={pending !== null}>
          {pending === 'login' ? 'Redirecting…' : 'Log in'}
        </button>
        <button className="btn btn-lg btn-block btn-secondary" onClick={() => go('signup')} disabled={pending !== null}>
          {pending === 'signup' ? 'Redirecting…' : 'Create an account'}
        </button>
        <p className="mono faint">You'll continue to our sign-in provider.</p>
      </main>
    </div>
  );
}

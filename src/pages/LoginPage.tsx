import { BrandLogo } from '../components/BrandLogo';
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
    <div className="auth-page login-page">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Link to="/" className="auth-back">← Back to Patient Priority</Link>
      <aside className="auth-intro"><p className="eyebrow">PATIENT PRIORITY</p><h2>Your care.<br />One place to begin.</h2><p>Start a visit with your patient account, or create one to get started.</p><div className="auth-help"><strong>First visit?</strong><p>Patients will need their Ontario health card for verification after creating an account.</p></div></aside>
      <main className="auth-card" id="main-content">
        <BrandLogo />
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1>Welcome back</h1>
        <p className="muted">Log in or create your patient account.</p>
        {error && <p className="error" role="alert">{error.message}</p>}
        <button className="btn btn-lg" onClick={() => go('login')} disabled={pending !== null}>
          {pending === 'login' ? 'Redirecting…' : 'Log in'}
        </button>
        <button className="btn btn-lg btn-ghost" onClick={() => go('signup')} disabled={pending !== null}>
          {pending === 'signup' ? 'Redirecting…' : 'Create an account'}
        </button>
        <p className="auth-footnote">
          You will continue to our sign-in provider to access your account. Are you a doctor?{' '}
          <Link to="/doctor/login">Doctor login</Link>
        </p>
      </main>
    </div>
  );
}

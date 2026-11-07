import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, signup, error } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/medical';
  const [pending, setPending] = useState<'login' | 'signup' | null>(null);

  const go = (mode: 'login' | 'signup') => {
    setPending(mode);
    (mode === 'login' ? login : signup)(from).catch(() => setPending(null));
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="brand">Patient Priority</Link>
        <h1>Welcome</h1>
        <p className="muted">Log in toooo your account, or create one to get started.</p>
        {error && <p className="error">{error.message}</p>}
        <button className="btn btn-lg" onClick={() => go('login')} disabled={pending !== null}>
          {pending === 'login' ? 'Redirecting…' : 'Log in'}
        </button>
        <button className="btn btn-lg btn-ghost" onClick={() => go('signup')} disabled={pending !== null}>
          {pending === 'signup' ? 'Redirecting…' : 'Sign up'}
        </button>
      </div>
    </div>
  );
}

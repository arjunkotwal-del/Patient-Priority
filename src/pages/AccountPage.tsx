import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export function AccountPage() {
  const { user, updateUser, logout, verification } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateUser({ name: name.trim() || user?.name });
    setSaved(true);
  };

  return (
    <div className="page page-narrow">
      <div>
        <span className="eyebrow">Your details</span>
        <h1>Account</h1>
      </div>

      <form className="card action-form" onSubmit={onSubmit}>
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Email
          <input value={user?.email ?? ''} disabled />
        </label>
        <div className="row">
          <button className="btn" type="submit">Save</button>
          {saved && <span className="muted">Saved.</span>}
        </div>
      </form>

      <section className="card stack-sm">
        <h2>Health card</h2>
        {verification?.verified ? (
          <>
            <p>
              Ontario health card <span className="mono">•••• {verification.last4}</span>
              {verification.versionCode ? ` (version ${verification.versionCode})` : ''}
            </p>
            <p className="muted small">
              {verification.legalName.first} {verification.legalName.last} · verified {new Date(verification.verifiedAt).toLocaleDateString()}
            </p>
          </>
        ) : (
          <p className="muted">Not verified.</p>
        )}
      </section>

      <div>
        <button className="btn btn-danger" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

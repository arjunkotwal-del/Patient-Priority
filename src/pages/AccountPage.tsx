import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';

export function AccountPage() {
  const { user, updateUser, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateUser({ name: name.trim() || user?.name });
    setSaved(true);
  };

  return (
    <div className="panel">
      <h1>Account</h1>
      <form onSubmit={onSubmit}>
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
        <button className="btn" type="submit">Save</button>
        {saved && <span className="muted"> Saved.</span>}
      </form>
      <hr />
      <button className="btn btn-danger" onClick={logout}>Log out</button>
    </div>
  );
}

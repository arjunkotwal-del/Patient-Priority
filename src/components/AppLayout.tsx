import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <NavLink to="/medical" className="brand"><span className="brand-mark" aria-hidden="true">+</span>Patient Priority</NavLink>
        <nav aria-label="Patient navigation">
          <NavLink to="/medical">Medical</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="topbar-user">
          <span>{user?.name}</span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="content" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}

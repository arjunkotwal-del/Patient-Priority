import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Patient Priority</span>
        <nav>
          <NavLink to="/medical">Medical</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
        <div className="topbar-user">
          <span>{user?.name}</span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

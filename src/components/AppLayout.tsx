import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon, initials } from './Icon';

/** The patient portal: sidebar navigation, a top bar, and the page. */
export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="side">
        <NavLink to="/visits" className="side-brand">
          <span className="logo" aria-hidden="true">+</span>
          <span><strong>PatientPriority</strong><span>Patient portal</span></span>
        </NavLink>
        <nav className="side-nav" aria-label="Patient navigation">
          <NavLink to="/visits" end><Icon name="chat" />Consultation</NavLink>
          <NavLink to="/visits/new"><Icon name="plus" />Start a visit</NavLink>
          <NavLink to="/history"><Icon name="history" />My medical history</NavLink>
          <NavLink to="/account"><Icon name="user" />Account</NavLink>
          <NavLink to="/settings"><Icon name="settings" />Settings</NavLink>
        </nav>
        <div className="side-foot">
          <div className="side-note">
            <span className="eyebrow">Fast track</span>
            <strong>CTAS 4 and 5 only</strong>
          </div>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">{initials(user?.name)}</span>
            <div>
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="btn btn-ghost" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">Virtual fast track</span>
          <span className="on-duty"><span className="dot dot-slate" aria-hidden="true" />Doctors reply here</span>
        </header>
        <main id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

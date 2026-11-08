import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon, initials } from './Icon';

/** The clinician workstation. Doctors never see the patient portal. */
export function DoctorLayout() {
  const { doctor, user, logout } = useAuth();
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="side">
        <NavLink to="/doctor" className="side-brand">
          <span className="logo" aria-hidden="true">+</span>
          <span><strong>PatientPriority</strong><span>Triage workstation</span></span>
        </NavLink>
        <nav className="side-nav" aria-label="Clinical navigation">
          <NavLink to="/doctor" end><Icon name="queue" />Patient queue</NavLink>
          <NavLink to="/doctor/settings"><Icon name="settings" />Settings</NavLink>
        </nav>
        <div className="side-foot">
          <div className="side-note">
            <span className="eyebrow">Triage protocol</span>
            <strong>Red flags go to the desk</strong>
          </div>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">{initials(doctor?.name ?? user?.name)}</span>
            <div>
              <strong>{doctor?.name}</strong>
              <span>{user?.email}</span>
            </div>
            <button className="btn btn-ghost" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="topbar-title">Fast track queue</span>
          <span className="on-duty"><span className="dot" aria-hidden="true" />{doctor?.name ?? 'Clinician'} on duty</span>
        </header>
        <main id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

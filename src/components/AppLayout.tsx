import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { callApi, type MyVisits } from '../pages/patientApi';
import { Icon } from './Icon';

/** The patient portal, laid out like the Stitch "Main chat" screen: fixed sidebar, glass top bar, page. */
export function AppLayout() {
  const { getToken } = useAuth();
  const { pathname } = useLocation();
  const [unread, setUnread] = useState(0);

  // The notifications dot: re-checked on every page change.
  useEffect(() => {
    callApi<MyVisits>(getToken, '/me/visits')
      .then((d) => setUnread(d.unreadTotal))
      .catch(() => {});
  }, [getToken, pathname]);

  const nav = [
    { to: '/visits', icon: 'chat_bubble', label: 'Main Chat', end: true },
    { to: '/history', icon: 'history_edu', label: 'My Medical History' },
    { to: '/care-plan', icon: 'vital_signs', label: 'Care Plan' },
    { to: '/notifications', icon: 'notifications', label: 'Doctor Notifications', dot: unread > 0 },
  ];

  return (
    <div className="portal">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="portal-side">
        <div className="portal-side-top">
          <Link to="/visits" className="portal-brand">
            <span className="portal-logo"><Icon name="neurology" size={22} /></span>
            <span>
              <strong>PatientPriority</strong>
              <small>Patient portal</small>
            </span>
          </Link>
          <nav className="portal-nav" aria-label="Patient navigation">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <span className="portal-nav-label"><Icon name={n.icon} size={20} />{n.label}</span>
                {n.dot && <span className="portal-dot" aria-label={`${unread} unread`} />}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="portal-side-box">
          <span>
            <small>Fast track</small>
            <strong>CTAS 4 and 5</strong>
          </span>
          <Icon name="verified_user" size={18} />
        </div>
      </aside>

      <header className="portal-top">
        <nav className="portal-top-nav" aria-label="Sections">
          <NavLink to="/visits" end>Consultation</NavLink>
          <NavLink to="/history">Medical History</NavLink>
          <NavLink to="/care-plan">Care Plan</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="portal-top-right">
          <span className="portal-duty"><span className="portal-duty-dot" />Doctors on duty</span>
          <Link to="/account" className="portal-me" aria-label="Your account"><Icon name="person" size={18} /></Link>
        </div>
      </header>

      <main className="portal-main" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}

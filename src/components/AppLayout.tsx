import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { callApi, type MyVisits } from '../pages/patientApi';
import { Icon, initials } from './Icon';

const RECENT_LIMIT = 10;

/** The patient portal: a sidebar (pages, recent visits, account) and a full-height page. */
export function AppLayout() {
  const { getToken, user } = useAuth();
  const { pathname } = useLocation();
  const [visits, setVisits] = useState<MyVisits | null>(null);

  // Recent visits and the notifications dot: re-checked on every page change.
  useEffect(() => {
    callApi<MyVisits>(getToken, '/me/visits')
      .then(setVisits)
      .catch(() => {});
  }, [getToken, pathname]);

  const unread = visits?.unreadTotal ?? 0;
  const nav = [
    { to: '/visits', icon: 'add', label: 'New visit', end: true },
    { to: '/history', icon: 'history_edu', label: 'My Medical History' },
    { to: '/care-plan', icon: 'vital_signs', label: 'Care Plan' },
    { to: '/notifications', icon: 'notifications', label: 'Doctor Notifications', dot: unread > 0 },
    { to: '/settings', icon: 'settings', label: 'Settings' },
  ];
  const recent = visits?.visits.slice(0, RECENT_LIMIT) ?? [];

  return (
    <div className="portal">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="portal-side">
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

        {recent.length > 0 && (
          <div className="portal-recents">
            <span className="portal-recents-title">Recent visits</span>
            {recent.map((v) => (
              <NavLink key={v.id} to={`/visits/${v.id}`} title={v.complaint}>
                <span className="portal-recent-text">{v.complaint}</span>
                {v.unreadCount > 0 && <span className="portal-dot" aria-label="New reply" />}
              </NavLink>
            ))}
          </div>
        )}

        <NavLink to="/account" className="portal-user">
          <span className="portal-user-avatar">{initials(user?.name)}</span>
          <span className="portal-user-text">
            <strong>{user?.name?.split('@')[0]}</strong>
            <small>Account</small>
          </span>
        </NavLink>
      </aside>

      <main className="portal-main" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}

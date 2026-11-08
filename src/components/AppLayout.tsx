import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PatientVisitsProvider, usePatientVisits } from './PatientVisitsContext';
import { WorkspaceShell } from './WorkspaceShell';

/** The patient portal: the shared workspace shell (sidebar, top bar, footer) around each page. */
export function AppLayout() {
  return (
    <PatientVisitsProvider>
      <PatientShell />
    </PatientVisitsProvider>
  );
}

function PatientShell() {
  const { user, logout } = useAuth();
  const { unreadTotal } = usePatientVisits();
  const name = user?.name ?? user?.email ?? 'Patient';
  return (
    <WorkspaceShell
      role="patient"
      name={name}
      email={user?.email}
      logout={logout}
      items={[
        { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/visits', label: 'Start a visit', icon: 'plus', end: true },
        { to: '/history', label: 'My visits', icon: 'chat' },
        { to: '/notifications', label: 'Notifications', icon: 'bell', count: unreadTotal },
        { to: '/account', label: 'My account', icon: 'account' },
        { to: '/settings', label: 'Settings', icon: 'settings' },
      ]}
    >
      <Outlet />
    </WorkspaceShell>
  );
}

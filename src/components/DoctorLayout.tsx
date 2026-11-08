import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceShell } from './WorkspaceShell';

/** The clinician workspace. Doctors never see the patient portal. */
export function DoctorLayout() {
  const { doctor, user, logout } = useAuth();
  return (
    <WorkspaceShell
      role="doctor"
      name={doctor?.name ?? user?.name ?? 'Clinician'}
      email={user?.email}
      logout={logout}
      items={[
        { to: '/doctor', label: 'Priority queue', icon: 'dashboard', end: true },
        { to: '/doctor/history', label: 'History', icon: 'history' },
        { to: '/doctor/settings', label: 'Settings', icon: 'settings' },
      ]}
    >
      <Outlet />
    </WorkspaceShell>
  );
}

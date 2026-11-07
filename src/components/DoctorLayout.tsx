import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** The clinician workspace. Doctors never see the patient app's layout or pages. */
export function DoctorLayout() {
  const { doctor, user, logout } = useAuth();
  return (
    <div className="clinic">
      <aside className="clinic-nav">
        <div className="clinic-brand">
          <span className="brand">Patient Priority</span>
          <span className="clinic-tag">Clinician</span>
        </div>
        <nav>
          <NavLink to="/doctor" end>Patient queue</NavLink>
          <NavLink to="/doctor/settings">Settings</NavLink>
        </nav>
        <div className="clinic-user">
          <strong>{doctor?.name}</strong>
          <span>{user?.email}</span>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="clinic-main">
        <Outlet />
      </main>
    </div>
  );
}

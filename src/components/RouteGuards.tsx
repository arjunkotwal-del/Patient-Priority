import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function Loading() {
  return (
    <div className="auth-page">
      <p className="muted">Loading…</p>
    </div>
  );
}

/**
 * Patient pages: logged in AND health card verified; otherwise sends you to /login or /verify.
 * Doctors have their own workspace, so they are sent to /doctor instead.
 */
export function ProtectedRoute() {
  const { user, isLoading, verification, verificationLoading, doctor, doctorLoading } = useAuth();
  const location = useLocation();
  if (isLoading || (user && (verificationLoading || doctorLoading))) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (doctor) return <Navigate to="/doctor" replace />;
  if (!verification?.verified) return <Navigate to="/verify" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Logged in but not yet verified: the health card scan step. Doctors skip it. */
export function VerifyRoute() {
  const { user, isLoading, verification, verificationLoading, doctor, doctorLoading } = useAuth();
  if (isLoading || (user && (verificationLoading || doctorLoading))) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (doctor) return <Navigate to="/doctor" replace />;
  if (verification?.verified) return <Navigate to="/visits" replace />;
  return <Outlet />;
}

/** Only for logins the server says are doctors. Everyone else goes to the patient side. */
export function DoctorRoute() {
  const { user, isLoading, doctor, doctorLoading, doctorError } = useAuth();
  const location = useLocation();
  if (isLoading || (user && doctorLoading)) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!doctor && doctorError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Couldn't check your account</h1>
          <p className="error">{doctorError}</p>
        </div>
      </div>
    );
  }
  if (!doctor) return <Navigate to="/visits" replace />;
  return <Outlet />;
}

/** Sends a logged-in user to the right side: the doctor queue or the patient app. */
export function HomeRedirect() {
  const { user, isLoading, doctor, doctorLoading } = useAuth();
  if (isLoading || (user && doctorLoading)) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={doctor ? '/doctor' : '/visits'} replace />;
}

/** Only reachable when logged OUT (landing + login); logged-in users go to the app. */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return <Outlet />;
}

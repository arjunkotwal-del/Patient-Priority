import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function Loading() {
  return (
    <div className="auth-page">
      <p className="muted">Loading…</p>
    </div>
  );
}

/** Logged in AND health card verified; otherwise sends you to /login or /verify. */
export function ProtectedRoute() {
  const { user, isLoading, verification, verificationLoading } = useAuth();
  const location = useLocation();
  if (isLoading || (user && verificationLoading)) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!verification?.verified) return <Navigate to="/verify" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Logged in but not yet verified: the health card scan step. */
export function VerifyRoute() {
  const { user, isLoading, verification, verificationLoading } = useAuth();
  if (isLoading || (user && verificationLoading)) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (verification?.verified) return <Navigate to="/medical" replace />;
  return <Outlet />;
}

/** Only reachable when logged OUT (landing + login); logged-in users go to the app. */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/medical" replace />;
  return <Outlet />;
}

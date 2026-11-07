import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function Loading() {
  return (
    <div className="auth-page">
      <p className="muted">Loading…</p>
    </div>
  );
}

/** Only reachable when logged in; otherwise sends you to /login. */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Only reachable when logged OUT (landing + login); logged-in users go to the app. */
export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (user) return <Navigate to="/medical" replace />;
  return <Outlet />;
}

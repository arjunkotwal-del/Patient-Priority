import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** Only reachable when logged in; otherwise sends you to /login. */
export function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Only reachable when logged OUT (landing + login); logged-in users go to the app. */
export function PublicOnlyRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to="/medical" replace />;
  return <Outlet />;
}

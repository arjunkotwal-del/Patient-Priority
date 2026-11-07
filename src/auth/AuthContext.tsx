import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth0Provider, useAuth0, type AppState } from '@auth0/auth0-react';

export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

/** Health card status as returned by the server (never includes the full number). */
export type Verification =
  | { verified: false }
  | {
      verified: true;
      province: 'ON';
      last4: string;
      versionCode: string | null;
      legalName: { first: string; last: string };
      verifiedAt: string;
    };

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: Error | undefined;
  /** Redirects to Auth0's hosted login page. */
  login: (returnTo?: string) => Promise<void>;
  /** Redirects to Auth0's hosted sign-up page. */
  signup: (returnTo?: string) => Promise<void>;
  logout: () => void;
  /** Display name is stored locally per user; email comes from Auth0. */
  updateUser: (changes: Pick<Partial<User>, 'name'>) => void;
  /** Access token for calling our /api routes. */
  getToken: () => Promise<string>;
  /** null while loading or when the status couldn't be fetched. */
  verification: Verification | null;
  verificationLoading: boolean;
  verificationError: string | null;
  refreshVerification: () => Promise<void>;
  setVerification: (v: Verification) => void;
}

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;

const AuthContext = createContext<AuthContextValue | null>(null);

const nameKey = (id: string) => `pp.displayName.${id}`;

function readName(id: string): string | null {
  try {
    return localStorage.getItem(nameKey(id));
  } catch {
    return null;
  }
}

function writeName(id: string, name: string) {
  try {
    localStorage.setItem(nameKey(id), name);
  } catch {
    /* storage unavailable; change lasts for this session only */
  }
}

function AuthBridge({ children }: { children: ReactNode }) {
  const auth0 = useAuth0();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const id = auth0.isAuthenticated ? auth0.user?.sub : undefined;
  const { getAccessTokenSilently } = auth0;

  useEffect(() => {
    setNameOverride(id ? readName(id) : null);
  }, [id]);

  const getToken = useCallback(async () => {
    const token = await getAccessTokenSilently();
    if (!token) throw new Error('Could not get an access token. Please log in again.');
    return token;
  }, [getAccessTokenSilently]);

  const refreshVerification = useCallback(async () => {
    setVerificationLoading(true);
    setVerificationError(null);
    try {
      const res = await fetch('/api/verification', {
        headers: { Authorization: `Bearer ${await getToken()}` },
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Server error (${res.status})`);
      setVerification(body as Verification);
    } catch (err) {
      setVerification(null);
      setVerificationError(err instanceof Error ? err.message : 'Could not check verification status.');
    } finally {
      setVerificationLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (id) void refreshVerification();
    else setVerification(null);
  }, [id, refreshVerification]);

  const user: User | null =
    id && auth0.user
      ? {
          id,
          email: auth0.user.email ?? '',
          name: nameOverride ?? auth0.user.name ?? auth0.user.email?.split('@')[0] ?? 'User',
          picture: auth0.user.picture,
        }
      : null;

  const redirect = (screen_hint: 'login' | 'signup', returnTo = '/medical') =>
    auth0.loginWithRedirect({
      appState: { returnTo },
      authorizationParams: { screen_hint },
    });

  const value: AuthContextValue = {
    user,
    isLoading: auth0.isLoading,
    error: auth0.error,
    login: (returnTo) => redirect('login', returnTo),
    signup: (returnTo) => redirect('signup', returnTo),
    logout: () => auth0.logout({ logoutParams: { returnTo: window.location.origin } }),
    updateUser: ({ name }) => {
      if (!id || !name) return;
      writeName(id, name);
      setNameOverride(name);
    },
    getToken,
    verification,
    // Treat "logged in but not fetched yet" as loading so guards don't redirect early.
    verificationLoading: verificationLoading || (!!id && verification === null && verificationError === null),
    verificationError,
    refreshVerification,
    setVerification,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  if (!domain || !clientId) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Auth not configured</h1>
          <p className="error">
            Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID in .env.local, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={(appState?: AppState) =>
        navigate(appState?.returnTo ?? '/medical', { replace: true })
      }
    >
      <AuthBridge>{children}</AuthBridge>
    </Auth0Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

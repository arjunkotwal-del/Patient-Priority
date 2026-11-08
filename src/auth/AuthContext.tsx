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

/** A doctor account, as stored in our database. */
export interface Doctor {
  id: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: Error | undefined;
  /** Patients: redirects to Auth0's hosted login page. */
  login: (returnTo?: string) => Promise<void>;
  /** Patients: redirects to Auth0's hosted sign-up page. */
  signup: (returnTo?: string) => Promise<void>;
  /**
   * Doctors: logs in with an existing email and password (made by npm run doctor:add).
   * There is no doctor sign-up. Throws the server's message on failure.
   */
  doctorLogin: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Display name is stored locally per user; email comes from Auth0. Patients only. */
  updateUser: (changes: Pick<Partial<User>, 'name'>) => void;
  /** Token for calling our /api routes (Auth0 for patients, our doctor session for doctors). */
  getToken: () => Promise<string>;
  /** Patients only. null while loading or when the status couldn't be fetched. */
  verification: Verification | null;
  verificationLoading: boolean;
  verificationError: string | null;
  refreshVerification: () => Promise<void>;
  setVerification: (v: Verification) => void;
  /** The logged-in doctor, or null for patients. */
  doctor: Doctor | null;
  /** True while a saved doctor session is being re-checked with the server. */
  doctorLoading: boolean;
  doctorError: string | null;
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

// ---- Doctor session (our own login, not Auth0) ----

interface DoctorSession {
  token: string;
  expiresAt: string;
  doctor: Doctor;
  email: string;
}

const SESSION_KEY = 'pp.doctorSession';
const expired = (s: DoctorSession) => Date.parse(s.expiresAt) <= Date.now();

function readSession(): DoctorSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as DoctorSession | null;
    return s?.token && s.doctor?.id && !expired(s) ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: DoctorSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable; the session lasts until this tab closes */
  }
}

function AuthBridge({ children }: { children: ReactNode }) {
  const auth0 = useAuth0();
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [session, setSession] = useState<DoctorSession | null>(readSession);
  // A session restored from storage is re-checked once (the doctor may have been removed).
  const [sessionChecked, setSessionChecked] = useState(() => readSession() === null);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  // Auth0 logins are always patients. A doctor session wins if both somehow exist.
  const patientId = !session && auth0.isAuthenticated ? auth0.user?.sub : undefined;
  const { getAccessTokenSilently } = auth0;

  const endSession = useCallback(() => {
    saveSession(null);
    setSession(null);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    setNameOverride(patientId ? readName(patientId) : null);
  }, [patientId]);

  const getToken = useCallback(async () => {
    if (session) {
      if (expired(session)) {
        endSession();
        throw new Error('Your session ended. Please log in again.');
      }
      return session.token;
    }
    const token = await getAccessTokenSilently();
    if (!token) throw new Error('Could not get an access token. Please log in again.');
    return token;
  }, [session, endSession, getAccessTokenSilently]);

  // Re-check a restored doctor session once. A 401/403 means it's no longer valid.
  useEffect(() => {
    if (!session || sessionChecked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/doctor/me', { headers: { Authorization: `Bearer ${session.token}` } });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.status === 401 || res.status === 403 || (res.ok && !body?.doctor)) return endSession();
        if (!res.ok) throw new Error(body?.message ?? `Server error (${res.status})`);
        setDoctorError(null);
      } catch (err) {
        if (!cancelled) setDoctorError(err instanceof Error ? err.message : 'Could not check your account.');
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, sessionChecked, endSession]);

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

  // Only patients have a health card. Doctors never fetch or store one.
  const isPatient = !!patientId;
  useEffect(() => {
    if (isPatient) void refreshVerification();
    else setVerification(null);
  }, [isPatient, refreshVerification]);

  const doctorLogin = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/doctor/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.message ?? `Server error (${res.status})`);
    const next: DoctorSession = { token: body.token, expiresAt: body.expiresAt, doctor: body.doctor, email: body.email };
    saveSession(next);
    setDoctorError(null);
    setSessionChecked(true);
    setSession(next);
  }, []);

  let user: User | null = null;
  if (session) {
    user = { id: `doctor|${session.doctor.id}`, email: session.email, name: session.doctor.name };
  } else if (patientId && auth0.user) {
    user = {
      id: patientId,
      email: auth0.user.email ?? '',
      name: nameOverride ?? auth0.user.name ?? auth0.user.email?.split('@')[0] ?? 'User',
      picture: auth0.user.picture,
    };
  }

  const redirect = (screen_hint: 'login' | 'signup', returnTo = '/home') =>
    auth0.loginWithRedirect({
      appState: { returnTo },
      authorizationParams: { screen_hint },
    });

  const value: AuthContextValue = {
    user,
    isLoading: session ? false : auth0.isLoading,
    error: session ? undefined : auth0.error,
    login: (returnTo) => redirect('login', returnTo),
    signup: (returnTo) => redirect('signup', returnTo),
    doctorLogin,
    logout: () => {
      if (session) return endSession();
      auth0.logout({ logoutParams: { returnTo: window.location.origin } });
    },
    updateUser: ({ name }) => {
      if (!patientId || !name) return;
      writeName(patientId, name);
      setNameOverride(name);
    },
    getToken,
    verification,
    // Treat "logged in but not fetched yet" as loading so guards don't redirect early.
    verificationLoading: verificationLoading || (isPatient && verification === null && verificationError === null),
    verificationError,
    refreshVerification,
    setVerification,
    doctor: session?.doctor ?? null,
    doctorLoading: !!session && !sessionChecked,
    doctorError,
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
        navigate(appState?.returnTo ?? '/home', { replace: true })
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

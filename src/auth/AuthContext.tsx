import { createContext, useContext, useState, type ReactNode } from 'react';

export interface User {
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (changes: Partial<User>) => void;
}

const STORAGE_KEY = 'pp.user';
const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(user: User | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable; session stays in memory only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser);

  // MOCK AUTH: accepts any email + non-empty password.
  // Replace the body of `login` with a call to your real auth backend.
  const login = async (email: string, password: string) => {
    if (!email || !password) throw new Error('Email and password are required.');
    const next: User = { email, name: email.split('@')[0] };
    saveUser(next);
    setUser(next);
  };

  const logout = () => {
    saveUser(null);
    setUser(null);
  };

  const updateUser = (changes: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      saveUser(next);
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

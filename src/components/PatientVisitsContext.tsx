import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { callApi, type VisitSummary } from '../pages/patientApi';
import { notifyIfHidden, subscribeToUpdates } from '../lib/live';
import { subscribeToRefresh } from '../lib/refresh';

interface VisitsState {
  visits: VisitSummary[] | null;
  unreadTotal: number;
  error: string | null;
  refresh: () => Promise<void>;
}
const Context = createContext<VisitsState | null>(null);
export function PatientVisitsProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await callApi<{ visits: VisitSummary[]; unreadTotal: number }>(getToken, '/me/visits');
      if (request !== sequence.current) return;
      setVisits(result.visits);
      setUnreadTotal(result.unreadTotal);
      setError(null);
    } catch (err) {
      if (request === sequence.current)
        setError(err instanceof Error ? err.message : 'Could not load your visits.');
    }
  }, [getToken]);
  useEffect(() => {
    void refresh();
    const stopRefresh = subscribeToRefresh(() => void refresh());
    const stop = subscribeToUpdates({
      as: 'patient',
      getToken,
      onConnect: () => void refresh(),
      onEvent: (event) => {
        void refresh();
        if (event.reason === 'doctor_reply' || event.reason === 'appointment_offered')
          notifyIfHidden(
            'Patient Priority',
            'A care update is available. Open your visit to read it.',
            `/visits/${event.visitId}`,
          );
      },
    });
    return () => {
      stop();
      stopRefresh();
      ++sequence.current;
    };
  }, [getToken, refresh]);
  return <Context.Provider value={{ visits, unreadTotal, error, refresh }}>{children}</Context.Provider>;
}
export function usePatientVisits() {
  const value = useContext(Context);
  if (!value) throw new Error('Patient visits require PatientVisitsProvider');
  return value;
}

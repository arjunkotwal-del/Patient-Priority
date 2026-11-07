// Live updates and browser notifications for the patient and doctor screens.
//
// Example (patient chat screen):
//   useEffect(() => subscribeToUpdates({
//     as: 'patient',
//     getToken: getAccessTokenSilently,
//     onEvent: (e) => {
//       if (e.visitId === visitId) refetchVisit();
//       if (e.reason === 'doctor_message') notifyIfHidden('Your doctor replied', 'Tap to read it.', `/visits/${e.visitId}`);
//     },
//   }), [visitId]);

/**
 * What the server sends. Events never contain health details: refetch the visit to see what changed.
 * - Patients get: doctor_message, doctor_update (prescription or test), status_changed
 * - Doctors get: new_case, patient_message, doctor_message, status_changed
 */
export interface LiveEvent {
  visitId: number;
  reason: 'new_case' | 'patient_message' | 'doctor_message' | 'doctor_update' | 'status_changed';
}

interface SubscribeOptions {
  as: 'patient' | 'doctor';
  /** Returns the Auth0 access token, e.g. getAccessTokenSilently from useAuth0(). */
  getToken: () => Promise<string>;
  onEvent: (event: LiveEvent) => void;
  /** Called after every (re)connect. Refetch here so nothing missed while offline is lost. */
  onConnect?: () => void;
}

const RETRY_MS = 3000;

/** Opens the live stream and keeps it open. Returns a function that closes it (use as a useEffect cleanup). */
export function subscribeToUpdates({ as, getToken, onEvent, onConnect }: SubscribeOptions): () => void {
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const retry = () => {
    if (!stopped) retryTimer = setTimeout(connect, RETRY_MS);
  };

  async function connect() {
    try {
      // Tickets work once, so every reconnect asks for a new one.
      const token = await getToken();
      const res = await fetch('/api/events/ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ as }),
      });
      if (!res.ok) throw new Error(`Ticket request failed (${res.status})`);
      const { ticket } = (await res.json()) as { ticket: string };
      if (stopped) return;

      source = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
      source.addEventListener('ready', () => onConnect?.());
      source.addEventListener('visit', (e) => onEvent(JSON.parse((e as MessageEvent<string>).data) as LiveEvent));
      source.onerror = () => {
        // The built-in retry would reuse the spent ticket, so close and start over.
        source?.close();
        source = null;
        retry();
      };
    } catch {
      retry();
    }
  }

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    source?.close();
  };
}

/** Asks to show notifications. Browsers only allow this from a click, so call it from a button. */
export async function askNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'default') await Notification.requestPermission();
  return Notification.permission === 'granted';
}

/** Shows a notification only if the tab isn't being looked at and permission was given. */
export function notifyIfHidden(title: string, body: string, openUrl?: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  const n = new Notification(title, { body, tag: openUrl ?? title });
  n.onclick = () => {
    window.focus();
    if (openUrl) window.location.assign(openUrl);
    n.close();
  };
}

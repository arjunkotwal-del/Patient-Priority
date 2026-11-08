// Small line icons for the sidebar. Decorative only: every icon sits next to a text label.
const PATHS = {
  chat: 'M4 5h16v11H8l-4 4V5z',
  plus: 'M12 5v14M5 12h14',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2',
  queue: 'M4 6h16M4 12h16M4 18h10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.2-1.2L17 5l-3-1-1 2h-2L10 4 7 5l.2 2L6 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2L7.2 17 7 19l3 1 1-2h2l1 2 3-1-.2-2 1.2-1.2 2 .2 1-3-2-1z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** First letters of a name or email, for the avatar square. */
export function initials(text?: string | null): string {
  const clean = (text ?? '').split('@')[0].replace(/[^a-zA-Z ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)) || '?';
}

export type IconName =
  | 'dashboard'
  | 'chat'
  | 'history'
  | 'calendar'
  | 'settings'
  | 'account'
  | 'book'
  | 'menu'
  | 'collapse'
  | 'arrow'
  | 'logout'
  | 'search'
  | 'check'
  | 'close'
  | 'bell'
  | 'plus';

const paths: Record<IconName, string> = {
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z M7 9h9 M7 13h6',
  history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  calendar:
    'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M7 3v4 M17 3v4 M3 11h18 M8 15h2 M14 15h2',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  account: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3',
  book: 'M12 5C9 2 5 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-3-1-7-2-10 1Z M12 5v15',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  collapse: 'M4 3h16v18H4z M9 3v18 M16 9l-3 3 3 3',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  logout: 'M9 3H4v18h5 M9 12h12 M16 7l5 5-5 5',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M15 15l6 6',
  check: 'm5 12 4 4L20 5',
  close: 'm6 6 12 12 M6 18 18 6',
  bell: 'M5 16h14l-2-3V9a5 5 0 0 0-10 0v4Z M10 20h4',
  plus: 'M12 4v16 M4 12h16',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

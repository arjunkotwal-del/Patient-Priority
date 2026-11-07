import { useEffect, useState } from 'react';

interface Settings {
  theme: 'system' | 'light' | 'dark';
  fontSize: 'normal' | 'large';
  emailNotifications: boolean;
}

const KEY = 'pp.settings';
const DEFAULTS: Settings = { theme: 'light', fontSize: 'normal', emailNotifications: true };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Applies saved theme/text size on startup so they persist across reloads. */
export function applySavedSettings() {
  apply(load());
}

function apply(settings: Settings) {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  root.dataset.fontSize = settings.fontSize;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    apply(settings);
  }, [settings]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="panel">
      <h1>Settings</h1>
      <label>
        Theme
        <select value={settings.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label>
        Text size
        <select value={settings.fontSize} onChange={(e) => set('fontSize', e.target.value as Settings['fontSize'])}>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.emailNotifications}
          onChange={(e) => set('emailNotifications', e.target.checked)}
        />
        Email notifications
      </label>
      <p className="muted">Settings save automatically.</p>
    </div>
  );
}

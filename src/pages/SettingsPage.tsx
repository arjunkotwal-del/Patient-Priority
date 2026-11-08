import { useEffect, useState } from 'react';

interface Settings {
  fontSize: 'normal' | 'large';
  emailNotifications: boolean;
}

const KEY = 'pp.settings';
const DEFAULTS: Settings = { fontSize: 'normal', emailNotifications: true };

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { fontSize: saved.fontSize === 'large' ? 'large' : 'normal', emailNotifications: saved.emailNotifications !== false };
  } catch {
    return DEFAULTS;
  }
}

/** Applies the saved text size on startup so it persists across reloads. The design is dark only. */
export function applySavedSettings() {
  apply(load());
}

function apply(settings: Settings) {
  document.documentElement.dataset.fontSize = settings.fontSize;
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
    <div className="page page-narrow">
      <div>
        <span className="eyebrow">Preferences</span>
        <h1>Settings</h1>
      </div>
      <section className="card action-form">
        <label>
          Text size
          <select value={settings.fontSize} onChange={(e) => set('fontSize', e.target.value as Settings['fontSize'])}>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.emailNotifications} onChange={(e) => set('emailNotifications', e.target.checked)} />
          Email notifications
        </label>
        <p className="mono faint">Settings save automatically.</p>
      </section>
    </div>
  );
}

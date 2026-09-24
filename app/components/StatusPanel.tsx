'use client';
// Live status from GET /api/status. The server returns booleans only; no configuration reaches the browser.
import { useEffect, useState } from 'react';

interface Status {
  app: 'online';
  gemini: boolean;
  telegram: boolean;
  supabase: boolean;
  voiceSkill: boolean;
  checkedAt: string;
}

const ROWS: { key: keyof Omit<Status, 'app' | 'checkedAt'>; label: string; on: string; off: string }[] = [
  { key: 'gemini', label: 'Gemini', on: 'Configured', off: 'Not configured' },
  { key: 'telegram', label: 'Telegram webhook', on: 'Connected', off: 'Not connected' },
  { key: 'supabase', label: 'Supabase', on: 'Connected', off: 'Not connected' },
  { key: 'voiceSkill', label: 'Voice Skill', on: 'Loaded', off: 'Missing' },
];

export function StatusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const pill = (state: 'ok' | 'bad' | 'wait', text: string) => (
    <span className={`status-pill is-${state}`}>
      <span className="status-dot" aria-hidden="true" />
      {text}
    </span>
  );

  return (
    <div className="status-card" aria-live="polite">
      <ul className="status-list">
        <li>
          <span>Application</span>
          {pill('ok', 'Online')}
        </li>
        {ROWS.map((row) => (
          <li key={row.key}>
            <span>{row.label}</span>
            {status ? pill(status[row.key] ? 'ok' : 'bad', status[row.key] ? row.on : row.off) : pill(failed ? 'bad' : 'wait', failed ? 'Unavailable' : 'Checking…')}
          </li>
        ))}
      </ul>
      <p className="status-note">
        {status
          ? `Checked live from the server at ${new Date(status.checkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST. Only on/off states are shared; no keys or settings.`
          : 'Runs real checks against each service from the server. Only on/off states are shared; no keys or settings.'}
      </p>
    </div>
  );
}

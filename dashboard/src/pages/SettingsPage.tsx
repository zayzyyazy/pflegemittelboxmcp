import { useEffect, useState } from 'react';
import { fetchPostCallMonitorStatus, fetchSettings, saveSettings, fetchStatus } from '../api';
import type { PostCallMonitorStatus, Settings, ServerStatus } from '../types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    mcp_url: '',
    env_label: 'local',
    leaping_mcp_url: '',
    leaping_agent_id: '',
  });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [monitorStatus, setMonitorStatus] = useState<PostCallMonitorStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchSettings(),
      fetchStatus().catch(() => null),
      fetchPostCallMonitorStatus().catch(() => null),
    ])
      .then(([s, st, ms]) => { setSettings(s); setStatus(st); setMonitorStatus(ms); })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <p className="page-title">Settings</p>
      <p className="page-sub">Configure the MCP server connection and environment label.</p>

      {/* ── Server status card ────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Server Status</h3>
          <span className={`badge ${status ? 'badge-safe' : 'badge-risky'}`}>
            {status ? '✓ reachable' : '✗ unreachable'}
          </span>
        </div>
        <div className="card-body">
          {status ? (
            <table style={{ width: 'auto' }}>
              <tbody>
                {([
                  ['Service', status.service],
                  ['Version', status.version],
                  ['Environment', status.env],
                  ['Tools registered', String(status.tool_count)],
                  ['Uptime', `${status.uptime_s}s`],
                ] as [string, string][]).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 24, paddingTop: 4, paddingBottom: 4 }}>{k}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>
              Cannot reach the server. Make sure <code>npm run dev</code> is running in the <code>server/</code> directory.
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Post-Call Monitor</h3>
          <span
            className={`badge ${
              monitorStatus?.enabled ? 'badge-safe' : 'badge-info'
            }`}
          >
            {monitorStatus?.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        <div className="card-body">
          {monitorStatus ? (
            <>
              <table style={{ width: 'auto' }}>
                <tbody>
                  {([
                    ['Running now', monitorStatus.running ? 'yes' : 'no'],
                    ['Configured clone/agent ID', monitorStatus.configured_agent_id ?? 'not set'],
                    ['Interval', monitorStatus.interval_seconds ? `${monitorStatus.interval_seconds}s` : 'n/a'],
                    ['Last run ok', monitorStatus.last_run_ok === null ? 'not run yet' : monitorStatus.last_run_ok ? 'yes' : 'no'],
                    ['Last finished', monitorStatus.last_run_finished_at ?? 'not run yet'],
                  ] as [string, string][]).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 24, paddingTop: 4, paddingBottom: 4 }}>{k}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {monitorStatus.last_error && (
                <div className="notice notice-warning" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>Last error:</strong> {monitorStatus.last_error}
                </div>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Monitor status is unavailable.
            </p>
          )}
        </div>
      </div>

      {/* ── Settings form ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-header"><h3>Configuration</h3></div>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="field">
              <label>MCP Server URL</label>
              <input
                type="text"
                value={settings.mcp_url}
                onChange={(e) => setSettings((s) => ({ ...s, mcp_url: e.target.value }))}
                placeholder="http://localhost:3001"
              />
              <div className="field-hint">
                When exposing externally (e.g. via ngrok), paste the public URL here.
              </div>
            </div>

            <div className="field">
              <label>Environment Label</label>
              <select
                value={settings.env_label}
                onChange={(e) => setSettings((s) => ({ ...s, env_label: e.target.value }))}
              >
                <option value="local">local</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
              <div className="field-hint">Shown in the dashboard header. Does not affect server behaviour.</div>
            </div>

            <div className="field">
              <label>Leaping MCP Connection URL <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                type="text"
                value={settings.leaping_mcp_url}
                onChange={(e) => setSettings((s) => ({ ...s, leaping_mcp_url: e.target.value }))}
                placeholder="Paste the MCP URL you registered in Leaping here for reference"
              />
              <div className="field-hint">
                For reference only — paste the URL you entered into Leaping's MCP Servers panel.
              </div>
            </div>

            <div className="field">
              <label>Leaping Clone / Agent ID</label>
              <input
                type="text"
                value={settings.leaping_agent_id}
                onChange={(e) => setSettings((s) => ({ ...s, leaping_agent_id: e.target.value }))}
                placeholder="e.g. c07c158a-1763-4ba9-acb9-2a6c6a633b25"
              />
              <div className="field-hint">
                Used by the background post-call monitor. You can paste the clone/agent ID from the Leaping URL here.
              </div>
            </div>

            <div className="gap-2">
              <button className="btn btn-primary" type="submit">Save</button>
              {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ Saved</span>}
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Email Secret Setup</h3></div>
        <div className="card-body">
          <div className="notice notice-warning" style={{ marginBottom: 12 }}>
            SMTP passwords and API keys are intentionally not stored in the dashboard UI.
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
            Keep the sensitive pieces in <code>server/.env</code>. For Gmail, the monitor still expects:
          </p>
          <pre className="json-block" style={{ marginBottom: 0 }}>
{`ALERT_EMAIL_PROVIDER=gmail
ALERT_EMAIL_FROM=Pflegemittelbox Alerts <yourgmail@gmail.com>
ALERT_EMAIL_TO=you@example.com
GMAIL_SMTP_USER=yourgmail@gmail.com
GMAIL_SMTP_APP_PASSWORD=your-google-app-password`}
          </pre>
        </div>
      </div>

      {/* ── Leaping connection guide ──────────────────────────── */}
      <div className="card">
        <div className="card-header"><h3>How to connect Leaping</h3></div>
        <div className="card-body">
          <div className="notice notice-info" style={{ marginBottom: 12 }}>
            Leaping can call this MCP server directly if you expose it on a public URL.
          </div>
          <ol style={{ paddingLeft: 20, lineHeight: 2.2, fontSize: 13, color: 'var(--text)' }}>
            <li>Start this server: <code style={{ fontFamily: 'var(--mono)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code> in <code>server/</code></li>
            <li>Expose it:
              <pre className="json-block" style={{ marginTop: 6, marginBottom: 0 }}>
{`# Option A — ngrok
ngrok http 3001

# Option B — Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3001`}
              </pre>
            </li>
            <li>Copy the public URL, e.g. <code>https://abc123.ngrok-free.app</code></li>
            <li>In Leaping → your agent → <strong>MCP Servers</strong> → Add</li>
            <li>Paste: <code>https://abc123.ngrok-free.app/mcp/sse</code></li>
            <li>Click <strong>Discover</strong> — Leaping will find <code>health_check</code> and <code>normalize_vnr</code></li>
            <li>Test <code>health_check</code> first to confirm the connection works</li>
          </ol>
          <div className="notice notice-warning" style={{ marginTop: 12 }}>
            <strong>Before going live:</strong> Only connect read-only / safe tools first. Do not expose production-changing
            functions until you have confirmed the server behaves correctly.
          </div>
        </div>
      </div>
    </>
  );
}

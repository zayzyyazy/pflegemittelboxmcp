import { useEffect, useState } from 'react';
import { fetchSettings, saveSettings, fetchStatus } from '../api';
import type { Settings, ServerStatus } from '../types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ mcp_url: '', env_label: 'local', leaping_mcp_url: '' });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSettings(), fetchStatus().catch(() => null)])
      .then(([s, st]) => { setSettings(s); setStatus(st); })
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

            <div className="gap-2">
              <button className="btn btn-primary" type="submit">Save</button>
              {saved && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ Saved</span>}
            </div>
          </form>
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

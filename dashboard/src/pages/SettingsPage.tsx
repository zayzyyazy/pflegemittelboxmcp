import { useEffect, useState } from 'react';
import {
  fetchPostCallMonitorStatus,
  fetchServerRuntime,
  fetchSettings,
  fetchStatus,
  runPostCallMonitorNow,
  saveSettings,
} from '../api';
import type {
  PostCallMonitorRunSummary,
  PostCallMonitorStatus,
  ServerRuntime,
  Settings,
  ServerStatus,
} from '../types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    mcp_url: '',
    env_label: 'local',
    leaping_mcp_url: '',
    leaping_agent_id: '',
  });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [monitorStatus, setMonitorStatus] = useState<PostCallMonitorStatus | null>(null);
  const [runtime, setRuntime] = useState<ServerRuntime | null>(null);
  const [lastManualRun, setLastManualRun] = useState<PostCallMonitorRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [runningMonitorNow, setRunningMonitorNow] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSettings(),
      fetchStatus().catch(() => null),
      fetchPostCallMonitorStatus().catch(() => null),
      fetchServerRuntime().catch(() => null),
    ])
      .then(([settingsResponse, statusResponse, monitorResponse, runtimeResponse]) => {
        setSettings(settingsResponse);
        setStatus(statusResponse);
        setMonitorStatus(monitorResponse);
        setRuntime(runtimeResponse);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleRunMonitorNow() {
    setRunningMonitorNow(true);
    try {
      const summary = await runPostCallMonitorNow();
      setLastManualRun(summary);
      const refreshed = await fetchPostCallMonitorStatus().catch(() => null);
      setMonitorStatus(refreshed);
    } finally {
      setRunningMonitorNow(false);
    }
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <p className="page-title">Operations</p>
      <p className="page-sub">Internal runtime, monitor controls, and non-secret dashboard settings.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Server Status</h3>
          <span className={`badge ${status ? 'badge-safe' : 'badge-risky'}`}>
            {status ? 'reachable' : 'unreachable'}
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
                  ['Node env', status.node_env ?? 'unknown'],
                  ['Tools registered', String(status.tool_count)],
                  ['Uptime', `${status.uptime_s}s`],
                  ['MCP auth', status.mcp_auth_enabled ? 'enabled' : 'disabled'],
                  ['Dashboard auth', status.dashboard_auth_enabled ? 'enabled' : 'disabled'],
                ] as [string, string][]).map(([key, value]) => (
                  <tr key={key}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 24, paddingTop: 4, paddingBottom: 4 }}>{key}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--danger)', fontSize: 13 }}>
              Cannot reach the server.
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Post-Call Monitor</h3>
          <span className={`badge ${monitorStatus?.enabled ? 'badge-safe' : 'badge-info'}`}>
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
                  ] as [string, string][]).map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 24, paddingTop: 4, paddingBottom: 4 }}>{key}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {monitorStatus.last_error ? (
                <div className="notice notice-warning" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>Last error:</strong> {monitorStatus.last_error}
                </div>
              ) : null}
              <div className="gap-2" style={{ display: 'flex', marginTop: 12 }}>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={runningMonitorNow}
                  onClick={() => void handleRunMonitorNow()}
                >
                  {runningMonitorNow ? 'Running…' : 'Run monitor now'}
                </button>
              </div>
              {lastManualRun ? (
                <pre className="json-block" style={{ marginTop: 12 }}>
                  {JSON.stringify(lastManualRun, null, 2)}
                </pre>
              ) : null}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Monitor status is unavailable.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Server Runtime / PM2</h3>
          <span className={`badge ${runtime?.pm2.available ? 'badge-safe' : 'badge-info'}`}>
            {runtime?.pm2.available ? 'pm2 visible' : 'pm2 unavailable'}
          </span>
        </div>
        <div className="card-body">
          {runtime ? (
            <>
              <table style={{ width: 'auto' }}>
                <tbody>
                  {([
                    ['Node version', runtime.node_version],
                    ['PID', String(runtime.pid)],
                    ['Platform', runtime.platform],
                    ['Uptime', `${runtime.uptime_s}s`],
                    ['Working dir', runtime.cwd],
                  ] as [string, string][]).map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, paddingRight: 24, paddingTop: 4, paddingBottom: 4 }}>{key}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <pre className="json-block" style={{ marginTop: 12 }}>
                {JSON.stringify(runtime.pm2.available ? runtime.pm2.process : { error: runtime.pm2.error }, null, 2)}
              </pre>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Runtime information is unavailable.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Configuration</h3></div>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="field">
              <label>MCP Server URL</label>
              <input
                type="text"
                value={settings.mcp_url}
                onChange={(event) => setSettings((current) => ({ ...current, mcp_url: event.target.value }))}
                placeholder="https://leapingai-api.pflegemittelbox.de"
              />
            </div>

            <div className="field">
              <label>Environment Label</label>
              <select
                value={settings.env_label}
                onChange={(event) => setSettings((current) => ({ ...current, env_label: event.target.value }))}
              >
                <option value="local">local</option>
                <option value="staging">staging</option>
                <option value="company">company</option>
                <option value="production">production</option>
              </select>
            </div>

            <div className="field">
              <label>Leaping MCP Connection URL</label>
              <input
                type="text"
                value={settings.leaping_mcp_url}
                onChange={(event) => setSettings((current) => ({ ...current, leaping_mcp_url: event.target.value }))}
                placeholder="https://leapingai-api.pflegemittelbox.de/mcp/sse"
              />
            </div>

            <div className="field">
              <label>Leaping Clone / Agent ID</label>
              <input
                type="text"
                value={settings.leaping_agent_id}
                onChange={(event) => setSettings((current) => ({ ...current, leaping_agent_id: event.target.value }))}
                placeholder="Paste the Leaping clone ID used by the post-call monitor"
              />
            </div>

            <div className="gap-2">
              <button className="btn btn-primary" type="submit">Save</button>
              {saved ? <span style={{ color: 'var(--success)', fontSize: 13 }}>Saved</span> : null}
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Secrets boundary</h3></div>
        <div className="card-body">
          <div className="notice notice-warning" style={{ marginBottom: 12 }}>
            SMTP passwords, OpenAI keys, Leaping credentials, and MCP shared secrets stay on the server only.
          </div>
          <pre className="json-block" style={{ marginBottom: 0 }}>
{`# keep these only in server/.env
MCP_AUTH_TOKEN=...
DASHBOARD_AUTH_PASSWORD=...
LEAPING_API_PASSWORD=...
GMAIL_SMTP_APP_PASSWORD=...
OPENAI_API_KEY=...`}
          </pre>
        </div>
      </div>
    </>
  );
}

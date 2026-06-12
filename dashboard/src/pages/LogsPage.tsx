import { useEffect, useState, useRef, Fragment } from 'react';
import { fetchLogs, clearLogs } from '../api';
import type { CallLog } from '../types';

export default function LogsPage() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function load() {
    fetchLogs(100)
      .then((r) => setLogs(r.logs))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (live) {
      pollRef.current = setInterval(load, 3_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [live]);

  async function handleClear() {
    if (!confirm('Clear all call logs?')) return;
    await clearLogs();
    setLogs([]);
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function pretty(json: string | null) {
    if (!json) return '—';
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <p className="page-title">Call Logs</p>
          <p className="page-sub">Every MCP tool call, whether from Leaping or the dashboard test form.</p>
        </div>
        <div className="gap-2">
          <button
            className={`btn btn-sm ${live ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setLive((v) => !v)}
          >
            {live ? (
              <><span className="live-dot" /> Live</>
            ) : (
              '⏸ Paused'
            )}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={load}>↻ Refresh</button>
          <button className="btn btn-sm btn-danger" onClick={handleClear}>🗑 Clear all</button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">No calls logged yet. Run a tool to see entries here.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Input</th>
                  <th>Output / Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleExpand(log.id)}
                    >
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{log.id}</td>
                      <td className="ts">
                        {new Date(log.timestamp).toLocaleString('de-DE', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td>
                        <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                          {log.tool_name}
                        </code>
                      </td>
                      <td>
                        <span className={`badge ${log.error ? 'badge-risky' : 'badge-safe'}`}>
                          {log.error ? '✗ error' : '✓ ok'}
                        </span>
                      </td>
                      <td className="log-duration">{log.duration_ms}ms</td>
                      <td className="log-input" title={log.input ?? ''}>{log.input ?? '—'}</td>
                      <td className={log.error ? 'log-error' : 'log-output'} title={log.output ?? log.error ?? ''}>
                        {log.error ? `ERR: ${log.error}` : (log.output ?? '—')}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {expanded === log.id ? '▲' : '▼'}
                      </td>
                    </tr>

                    {expanded === log.id && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: '#f8f9fc' }}>
                          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                Input
                              </div>
                              <pre className="json-block">{pretty(log.input)}</pre>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: log.error ? 'var(--danger)' : 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                {log.error ? 'Error' : 'Output'}
                              </div>
                              <pre className={`json-block ${log.error ? 'error' : ''}`}>
                                {log.error ? log.error : pretty(log.output)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

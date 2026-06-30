import { useEffect, useState, useRef, Fragment } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchLogs } from '../api';
import type { CallLog } from '../types';

function pretty(json: string | null) {
  if (!json) return '—';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function SessionsPage() {
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const activeSessionId = (routeSessionId ?? '').trim();
  const [inputSessionId, setInputSessionId] = useState(activeSessionId);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setInputSessionId(activeSessionId);
  }, [activeSessionId]);

  function load() {
    if (!activeSessionId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLogs(500, activeSessionId)
      .then((r) => setLogs(r.logs))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [activeSessionId]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (activeSessionId) {
      pollRef.current = setInterval(load, 5_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeSessionId]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = inputSessionId.trim();
    if (!trimmed) return;
    navigate(`/sessions/${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <p className="page-title">Session Inspector</p>
          <p className="page-sub">
            Inspect all MCP tool calls for one Leaping conversation (<code>leaping_conversation_id_hex</code>).
          </p>
        </div>
        <Link className="btn btn-sm btn-ghost" to="/logs">← All logs</Link>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleSearch} className="gap-2" style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }}
            placeholder="Paste session_id (e.g. leaping_conversation_id_hex)"
            value={inputSessionId}
            onChange={(e) => setInputSessionId(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">Inspect session</button>
          <button className="btn btn-ghost" type="button" onClick={load}>↻ Refresh</button>
        </form>
      </div>

      {!activeSessionId ? (
        <div className="card">
          <div className="empty-state">Enter a session_id to inspect chronological MCP calls for that conversation.</div>
        </div>
      ) : loading && logs.length === 0 ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty-state">No MCP calls logged yet for session <code>{activeSessionId}</code>.</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
            Session <code>{activeSessionId}</code> · {logs.length} call{logs.length === 1 ? '' : 's'} · chronological
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Brain</th>
                  <th>Action</th>
                  <th>Function</th>
                  <th>Transition</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded((prev) => (prev === log.id ? null : log.id))}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{log.id}</td>
                      <td className="ts">
                        {new Date(log.timestamp).toLocaleString('de-DE', {
                          month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                      <td><code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{log.tool_name}</code></td>
                      <td>
                        <span className={`badge ${log.error || log.status === 'error' ? 'badge-risky' : 'badge-safe'}`}>
                          {log.error || log.status === 'error' ? '✗ error' : '✓ ok'}
                        </span>
                      </td>
                      <td className="log-duration">{log.duration_ms}ms</td>
                      <td>{log.active_brain ?? '—'}</td>
                      <td>{log.action_type ?? '—'}</td>
                      <td>{log.function_name ?? '—'}</td>
                      <td>{log.transition_name ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{expanded === log.id ? '▲' : '▼'}</td>
                    </tr>
                    {expanded === log.id && (
                      <tr>
                        <td colSpan={10} style={{ padding: 0, background: '#f8f9fc' }}>
                          <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                Sanitized input
                              </div>
                              <pre className="json-block">{pretty(log.input)}</pre>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: log.error ? 'var(--danger)' : 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                                {log.error ? 'Error' : 'Sanitized output'}
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

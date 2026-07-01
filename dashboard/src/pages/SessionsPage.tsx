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

interface SessionStoredValues {
  active_verification_path?: string | null;
  phone_lookup_found?: boolean | null;
  plz?: string | null;
  house_number?: string | null;
  birthday_customer?: string | null;
  vnr_candidate?: string | null;
  vnr_confirmed?: boolean | null;
  get_customer_by_plz_geb_result?: string | null;
  get_customer_by_insurance_number_result?: string | null;
  check_birthday_result?: string | null;
  check_birthday_error?: string | null;
  check_insurance_number_format_result?: string | null;
}

function parseJsonRecord(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractStoredValues(logs: CallLog[]): SessionStoredValues | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const output = parseJsonRecord(logs[i].output);
    if (!output) continue;
    const debug = output.debug as Record<string, unknown> | undefined;
    const stored = debug?.stored_values as SessionStoredValues | undefined;
    if (stored) return stored;
  }
  return null;
}

function birthdayStatus(stored: SessionStoredValues | null): string {
  if (!stored) return '—';
  if (stored.check_birthday_result && stored.check_birthday_result !== 'not_called') {
    return stored.check_birthday_result;
  }
  const lookupFound =
    stored.get_customer_by_plz_geb_result === 'found' ||
    stored.get_customer_by_insurance_number_result === 'found';
  if (lookupFound && stored.birthday_customer) return 'pending check_birthday';
  if (lookupFound) return 'pending collection';
  return 'not started';
}

function SessionStatePanel({ stored }: { stored: SessionStoredValues | null }) {
  if (!stored) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No MCP session state captured yet for this conversation.
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Active path', value: stored.active_verification_path ?? '—' },
    { label: 'Phone lookup found', value: stored.phone_lookup_found === null || stored.phone_lookup_found === undefined ? '—' : String(stored.phone_lookup_found) },
    { label: 'PLZ', value: stored.plz ?? '—' },
    { label: 'House number', value: stored.house_number ?? '—' },
    { label: 'Birthday (customer)', value: stored.birthday_customer ?? '—' },
    { label: 'VNR candidate', value: stored.vnr_candidate ?? '—' },
    { label: 'VNR confirmed', value: stored.vnr_confirmed === null || stored.vnr_confirmed === undefined ? '—' : String(stored.vnr_confirmed) },
    { label: 'Address lookup', value: stored.get_customer_by_plz_geb_result ?? '—' },
    { label: 'VNR lookup', value: stored.get_customer_by_insurance_number_result ?? '—' },
    { label: 'Birthday check', value: birthdayStatus(stored) },
    { label: 'Birthday error', value: stored.check_birthday_error ?? '—' },
  ];

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        MCP session state (operator only)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ fontSize: 13 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.label}</div>
            <code style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{row.value}</code>
          </div>
        ))}
      </div>
    </div>
  );
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
        <>
          <SessionStatePanel stored={extractStoredValues(logs)} />
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
        </>
      )}
    </>
  );
}

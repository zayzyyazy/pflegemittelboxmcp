import { useEffect, useState } from 'react';
import { fetchTools, fetchLogs, testTool } from '../api';
import type { ToolDef, CallLog } from '../types';

interface TestState {
  input: Record<string, string>;
  running: boolean;
  result: unknown;
  error: string | null;
  duration: number | null;
}

function emptyTest(): TestState {
  return { input: {}, running: false, result: null, error: null, duration: null };
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTool, setOpenTool] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [recentLogs, setRecentLogs] = useState<CallLog[]>([]);

  useEffect(() => {
    fetchTools()
      .then((r) => {
        setTools(r.tools);
        const initial: Record<string, TestState> = {};
        for (const t of r.tools) initial[t.name] = emptyTest();
        setTestStates(initial);
      })
      .finally(() => setLoading(false));

    fetchLogs(20).then((r) => setRecentLogs(r.logs));
  }, []);

  function setInput(toolName: string, field: string, value: string) {
    setTestStates((prev) => ({
      ...prev,
      [toolName]: { ...prev[toolName], input: { ...prev[toolName].input, [field]: value } },
    }));
  }

  async function runTest(tool: ToolDef) {
    setTestStates((prev) => ({ ...prev, [tool.name]: { ...prev[tool.name], running: true, result: null, error: null, duration: null } }));
    try {
      const res = await testTool(tool.name, testStates[tool.name].input);
      setTestStates((prev) => ({
        ...prev,
        [tool.name]: { ...prev[tool.name], running: false, result: res.output, error: null, duration: res.duration_ms },
      }));
      // Refresh recent logs
      fetchLogs(20).then((r) => setRecentLogs(r.logs));
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [tool.name]: { ...prev[tool.name], running: false, error: String(e), duration: null },
      }));
    }
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <p className="page-title">MCP Tools</p>
      <p className="page-sub">
        These tools are exposed via the MCP server. Use the test forms below to call them and inspect results.
      </p>

      {tools.map((tool) => {
        const ts = testStates[tool.name] ?? emptyTest();
        const isOpen = openTool === tool.name;
        const hasFields = tool.inputSchema.required.length > 0;

        return (
          <div className="card" key={tool.name}>
            <div className="card-header">
              <h3 style={{ fontFamily: 'var(--mono)' }}>{tool.name}</h3>
              <span className="badge badge-cat">{tool.category}</span>
              <span className={`badge ${tool.safe ? 'badge-safe' : 'badge-risky'}`}>
                {tool.safe ? '✓ safe' : '⚠ risky'}
              </span>
              <button
                className={`btn btn-sm ${isOpen ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => setOpenTool(isOpen ? null : tool.name)}
              >
                {isOpen ? 'Close' : '▶ Test'}
              </button>
            </div>

            <div className="card-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 8 }}>
                {tool.description}
              </p>

              <div className="schema-block">
                <strong style={{ color: 'var(--text-label)' }}>Input schema</strong>
                <br />
                {Object.entries(tool.inputSchema.properties).length === 0
                  ? '(no input required)'
                  : Object.entries(tool.inputSchema.properties).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ color: '#6baed6' }}>{k}</span>:{' '}
                        <span style={{ color: '#74c476' }}>{v.type}</span>
                        {v.description && (
                          <span style={{ color: '#969696' }}> — {v.description}</span>
                        )}
                      </div>
                    ))}
              </div>
            </div>

            {/* ── Test panel ───────────────────────────────────── */}
            {isOpen && (
              <div className="test-panel">
                {hasFields &&
                  Object.entries(tool.inputSchema.properties).map(([field, schema]) => (
                    <div className="field" key={field}>
                      <label>{field} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({schema.type})</span></label>
                      <textarea
                        rows={2}
                        placeholder={schema.description ?? `Enter ${field}...`}
                        value={ts.input[field] ?? ''}
                        onChange={(e) => setInput(tool.name, field, e.target.value)}
                      />
                      {tool.name === 'normalize_vnr' && field === 'text' && (
                        <div className="field-hint">
                          Example: <code>L wie Ludwig null drei neun drei fünf neun neun zwei drei</code>
                        </div>
                      )}
                    </div>
                  ))}

                <button
                  className="btn btn-primary"
                  disabled={ts.running}
                  onClick={() => runTest(tool)}
                >
                  {ts.running ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Running…</> : '▶ Run Tool'}
                </button>

                {(ts.result !== null || ts.error) && (
                  <div className="test-result">
                    <h4>
                      Result
                      {ts.duration !== null && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
                          {ts.duration}ms
                        </span>
                      )}
                    </h4>
                    <pre className={`json-block ${ts.error ? 'error' : ''}`}>
                      {ts.error
                        ? `Error: ${ts.error}`
                        : JSON.stringify(ts.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Recent call history ──────────────────────────────────── */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header">
          <h3>Recent Test History</h3>
          <span className="badge badge-info">{recentLogs.length} calls</span>
        </div>
        <div className="table-wrap">
          {recentLogs.length === 0 ? (
            <div className="empty-state">No tool calls yet. Run a test above.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tool</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="ts">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{log.tool_name}</span>
                    </td>
                    <td className="log-input" title={log.input ?? ''}>{log.input ?? '—'}</td>
                    <td className={log.error ? 'log-error' : 'log-output'} title={log.output ?? log.error ?? ''}>
                      {log.error ? `ERR: ${log.error}` : (log.output ?? '—')}
                    </td>
                    <td className="log-duration">{log.duration_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

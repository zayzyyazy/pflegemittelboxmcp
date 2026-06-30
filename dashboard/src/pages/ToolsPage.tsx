import { useEffect, useMemo, useState } from 'react';
import {
  createDashboardTestCase,
  deleteDashboardTestCase,
  fetchDashboardTestCases,
  fetchLogs,
  fetchTools,
  testTool,
  updateDashboardTestCase,
} from '../api';
import type { CallLog, DashboardTestCase, ToolDef } from '../types';

interface ToolRunState {
  jsonInput: string;
  running: boolean;
  result: unknown;
  error: string | null;
  duration: number | null;
  selectedTestCaseId: number | null;
}

function buildDefaultJson(tool: ToolDef) {
  const input: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(tool.inputSchema.properties)) {
    if (schema.type === 'number') input[field] = 1;
    else if (schema.type === 'boolean') input[field] = false;
    else input[field] = '';
  }
  return JSON.stringify(input, null, 2);
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [testCases, setTestCases] = useState<DashboardTestCase[]>([]);
  const [states, setStates] = useState<Record<string, ToolRunState>>({});
  const [openTool, setOpenTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTools(), fetchLogs(20), fetchDashboardTestCases()])
      .then(([toolResponse, logResponse, testCaseResponse]) => {
        setTools(toolResponse.tools);
        setLogs(logResponse.logs);
        setTestCases(testCaseResponse.test_cases);

        const nextStates: Record<string, ToolRunState> = {};
        for (const tool of toolResponse.tools) {
          nextStates[tool.name] = {
            jsonInput: buildDefaultJson(tool),
            running: false,
            result: null,
            error: null,
            duration: null,
            selectedTestCaseId: null,
          };
        }
        setStates(nextStates);
      })
      .finally(() => setLoading(false));
  }, []);

  const testCasesByTool = useMemo(() => {
    const grouped: Record<string, DashboardTestCase[]> = {};
    for (const testCase of testCases) {
      if (!grouped[testCase.tool_name]) grouped[testCase.tool_name] = [];
      grouped[testCase.tool_name].push(testCase);
    }
    return grouped;
  }, [testCases]);

  function setToolState(toolName: string, partial: Partial<ToolRunState>) {
    setStates((prev) => ({ ...prev, [toolName]: { ...prev[toolName], ...partial } }));
  }

  async function refreshLogs() {
    const response = await fetchLogs(20);
    setLogs(response.logs);
  }

  async function refreshTestCases() {
    const response = await fetchDashboardTestCases();
    setTestCases(response.test_cases);
  }

  async function handleRun(tool: ToolDef) {
    const current = states[tool.name];
    setToolState(tool.name, { running: true, error: null, result: null, duration: null });

    try {
      const parsed = current.jsonInput.trim() ? JSON.parse(current.jsonInput) : {};
      const response = await testTool(tool.name, parsed);
      setToolState(tool.name, {
        running: false,
        result: response.output,
        duration: response.duration_ms,
        error: null,
      });
      await refreshLogs();
    } catch (error) {
      setToolState(tool.name, {
        running: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleSave(tool: ToolDef) {
    const current = states[tool.name];
    let parsed: Record<string, unknown>;
    try {
      parsed = current.jsonInput.trim() ? JSON.parse(current.jsonInput) : {};
    } catch {
      setToolState(tool.name, { error: 'Input JSON is invalid.' });
      return;
    }

    const existing = current.selectedTestCaseId
      ? testCases.find((entry) => entry.id === current.selectedTestCaseId)
      : null;
    const proposedName = window.prompt(
      'Test case name',
      existing?.name ?? `${tool.name} test`
    );
    if (!proposedName?.trim()) return;

    if (existing) {
      await updateDashboardTestCase(existing.id, {
        name: proposedName.trim(),
        tool_name: tool.name,
        input: parsed,
      });
    } else {
      const response = await createDashboardTestCase({
        name: proposedName.trim(),
        tool_name: tool.name,
        input: parsed,
      });
      if (response.test_case) {
        setToolState(tool.name, { selectedTestCaseId: response.test_case.id });
      }
    }
    await refreshTestCases();
  }

  async function handleDeleteSaved(tool: ToolDef) {
    const current = states[tool.name];
    if (!current.selectedTestCaseId) return;
    if (!window.confirm('Delete this saved test case?')) return;
    await deleteDashboardTestCase(current.selectedTestCaseId);
    setToolState(tool.name, { selectedTestCaseId: null });
    await refreshTestCases();
  }

  function handleLoadSaved(toolName: string, testCaseId: number) {
    const testCase = testCases.find((entry) => entry.id === testCaseId);
    if (!testCase) return;
    setToolState(toolName, {
      selectedTestCaseId: testCase.id,
      jsonInput: JSON.stringify(testCase.input, null, 2),
      result: null,
      error: null,
      duration: null,
    });
  }

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <p className="page-title">MCP Tools</p>
      <p className="page-sub">
        Test each MCP tool with raw JSON input, inspect returned JSON, and save reusable operator test cases.
      </p>

      {tools.map((tool) => {
        const state = states[tool.name];
        const savedCases = testCasesByTool[tool.name] ?? [];
        const isOpen = openTool === tool.name;

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
                {isOpen ? 'Close' : 'Open'}
              </button>
            </div>

            <div className="card-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 8 }}>
                {tool.description}
              </p>
              <div className="schema-block">
                <strong style={{ color: 'var(--text-label)' }}>Input schema</strong>
                <br />
                {Object.keys(tool.inputSchema.properties).length === 0
                  ? '(no input required)'
                  : Object.entries(tool.inputSchema.properties).map(([name, schema]) => (
                      <div key={name}>
                        <span style={{ color: '#6baed6' }}>{name}</span>:{' '}
                        <span style={{ color: '#74c476' }}>{schema.type}</span>
                        {schema.description ? (
                          <span style={{ color: '#969696' }}> — {schema.description}</span>
                        ) : null}
                      </div>
                    ))}
              </div>
            </div>

            {isOpen ? (
              <div className="test-panel">
                <div className="field">
                  <label>Saved test cases</label>
                  <div className="gap-2" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={state.selectedTestCaseId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) {
                          setToolState(tool.name, { selectedTestCaseId: null });
                          return;
                        }
                        handleLoadSaved(tool.name, Number(value));
                      }}
                    >
                      <option value="">Select saved case…</option>
                      {savedCases.map((testCase) => (
                        <option key={testCase.id} value={testCase.id}>
                          {testCase.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm btn-ghost" onClick={() => void handleSave(tool)}>
                      Save current
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      disabled={!state.selectedTestCaseId}
                      onClick={() => void handleDeleteSaved(tool)}
                    >
                      Delete saved
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>Manual JSON input</label>
                  <textarea
                    rows={14}
                    value={state.jsonInput}
                    onChange={(event) => setToolState(tool.name, { jsonInput: event.target.value })}
                    placeholder='{"example": "value"}'
                    style={{ fontFamily: 'var(--mono)' }}
                  />
                </div>

                <div className="gap-2" style={{ display: 'flex', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    disabled={state.running}
                    onClick={() => void handleRun(tool)}
                  >
                    {state.running ? 'Running…' : 'Run tool'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setToolState(tool.name, { jsonInput: buildDefaultJson(tool), result: null, error: null, duration: null })}
                  >
                    Reset input
                  </button>
                </div>

                {(state.result !== null || state.error) ? (
                  <div className="test-result">
                    <h4>
                      Result
                      {state.duration !== null ? (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
                          {state.duration}ms
                        </span>
                      ) : null}
                    </h4>
                    <pre className={`json-block ${state.error ? 'error' : ''}`}>
                      {state.error ? `Error: ${state.error}` : JSON.stringify(state.result, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header">
          <h3>Recent Test History</h3>
          <span className="badge badge-info">{logs.length} calls</span>
        </div>
        <div className="table-wrap">
          {logs.length === 0 ? (
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
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="ts">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{log.tool_name}</span></td>
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

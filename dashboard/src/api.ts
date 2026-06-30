/**
 * Thin API client. All paths are relative so Vite's proxy forwards them to
 * http://localhost:3001 during development.
 */

const BASE = '/api/dashboard';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Status ──────────────────────────────────────────────────────────────
export function fetchStatus() {
  return request<import('./types').ServerStatus>('/status');
}

// ── Tools ───────────────────────────────────────────────────────────────
export function fetchTools() {
  return request<{ tools: import('./types').ToolDef[] }>('/tools');
}

export function testTool(name: string, input: Record<string, unknown>) {
  return request<{ output: unknown; duration_ms: number; error?: string }>(
    `/tools/${name}/test`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

// ── Logs ────────────────────────────────────────────────────────────────
export function fetchLogs(limit = 50, sessionId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sessionId?.trim()) params.set('session_id', sessionId.trim());
  return request<{ logs: import('./types').CallLog[] }>(`/logs?${params.toString()}`);
}

export function clearLogs() {
  return request<{ ok: boolean }>('/logs', { method: 'DELETE' });
}

// ── Leaping functions ────────────────────────────────────────────────────
export function fetchLeapingFunctions() {
  return request<{ functions: import('./types').LeapingFunction[] }>(
    '/leaping-functions'
  );
}

// ── Settings ─────────────────────────────────────────────────────────────
export function fetchSettings() {
  return request<import('./types').Settings>('/settings');
}

export function saveSettings(data: Partial<import('./types').Settings>) {
  return request<import('./types').Settings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function fetchPostCallMonitorStatus() {
  return request<import('./types').PostCallMonitorStatus>('/post-call-monitor/status');
}

export function runPostCallMonitorNow() {
  return request<import('./types').PostCallMonitorRunSummary>('/post-call-monitor/run', {
    method: 'POST',
  });
}

export function fetchDashboardTestCases() {
  return request<{ test_cases: import('./types').DashboardTestCase[] }>('/test-cases');
}

export function createDashboardTestCase(
  payload: Pick<import('./types').DashboardTestCase, 'name' | 'tool_name' | 'input'>
) {
  return request<{ ok: boolean; test_case: import('./types').DashboardTestCase | null }>('/test-cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateDashboardTestCase(
  id: number,
  payload: Pick<import('./types').DashboardTestCase, 'name' | 'tool_name' | 'input'>
) {
  return request<{ ok: boolean; test_case: import('./types').DashboardTestCase | null }>(`/test-cases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteDashboardTestCase(id: number) {
  return request<{ ok: boolean }>(`/test-cases/${id}`, {
    method: 'DELETE',
  });
}

export function fetchRecentAlerts(limit = 20) {
  return request<{ alerts: import('./types').PostCallAlertHistoryEntry[] }>(
    `/post-call-alerts?limit=${limit}`
  );
}

export function fetchServerRuntime() {
  return request<import('./types').ServerRuntime>('/server-runtime');
}

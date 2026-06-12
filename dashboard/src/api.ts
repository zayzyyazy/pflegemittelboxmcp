/**
 * Thin API client. All paths are relative so Vite's proxy forwards them to
 * http://localhost:3001 during development.
 */

const BASE = '';

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
  return request<import('./types').ServerStatus>('/api/status');
}

// ── Tools ───────────────────────────────────────────────────────────────
export function fetchTools() {
  return request<{ tools: import('./types').ToolDef[] }>('/api/tools');
}

export function testTool(name: string, input: Record<string, unknown>) {
  return request<{ output: unknown; duration_ms: number; error?: string }>(
    `/api/tools/${name}/test`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

// ── Logs ────────────────────────────────────────────────────────────────
export function fetchLogs(limit = 50) {
  return request<{ logs: import('./types').CallLog[] }>(`/api/logs?limit=${limit}`);
}

export function clearLogs() {
  return request<{ ok: boolean }>('/api/logs', { method: 'DELETE' });
}

// ── Leaping functions ────────────────────────────────────────────────────
export function fetchLeapingFunctions() {
  return request<{ functions: import('./types').LeapingFunction[] }>(
    '/api/leaping-functions'
  );
}

// ── Settings ─────────────────────────────────────────────────────────────
export function fetchSettings() {
  return request<import('./types').Settings>('/api/settings');
}

export function saveSettings(data: Partial<import('./types').Settings>) {
  return request<import('./types').Settings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

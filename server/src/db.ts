// Uses the Node.js built-in sqlite module (available in Node 22.5+, no npm package needed)
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  extractMcpCallLogMeta,
  sanitizeMcpToolInput,
  sanitizeMcpToolOutput,
  type McpCallLogMeta,
} from './tools/verification-brain-sanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'pflegemittelbox.db'));

// WAL mode for better concurrent-read performance
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS call_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    tool_name   TEXT    NOT NULL,
    input       TEXT,
    output      TEXT,
    error       TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_post_call_alerts (
    call_id      TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS dashboard_test_cases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    tool_name   TEXT    NOT NULL,
    input_json  TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS post_call_alert_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id         TEXT,
    call_date       TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    alert_required  INTEGER NOT NULL DEFAULT 0,
    email_sent      INTEGER NOT NULL DEFAULT 0,
    provider        TEXT,
    subject         TEXT,
    biggest_problem TEXT,
    email_text      TEXT,
    reason          TEXT,
    severity        TEXT
  );
`);

function ensureCallLogColumns(): void {
  const columns: Array<[string, string]> = [
    ['session_id', 'TEXT'],
    ['active_brain', 'TEXT'],
    ['action_type', 'TEXT'],
    ['function_name', 'TEXT'],
    ['transition_name', 'TEXT'],
    ['status', 'TEXT'],
  ];
  for (const [name, type] of columns) {
    try {
      db.exec(`ALTER TABLE call_logs ADD COLUMN ${name} ${type}`);
    } catch {
      // column already exists
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_call_logs_session_id ON call_logs(session_id)');
}

ensureCallLogColumns();

// Seed defaults only when the key does not yet exist
const defaults: [string, string][] = [
  ['mcp_url', 'http://localhost:3001'],
  ['env_label', 'local'],
  ['leaping_mcp_url', ''],
  ['leaping_agent_id', ''],
];
for (const [k, v] of defaults) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (@k, @v)').run({ k, v });
}

// ── Call log helpers ────────────────────────────────────────────────────

const insertLog = db.prepare(`
  INSERT INTO call_logs (
    tool_name, input, output, error, duration_ms,
    session_id, active_brain, action_type, function_name, transition_name, status
  )
  VALUES (
    @toolName, @input, @output, @error, @durationMs,
    @sessionId, @activeBrain, @actionType, @functionName, @transitionName, @status
  )
`);

export function logCall(
  toolName: string,
  input: unknown,
  output: unknown,
  error: string | null,
  durationMs: number,
  metaOverride?: Partial<McpCallLogMeta>
): void {
  const sanitizedInput = sanitizeMcpToolInput(toolName, input);
  const sanitizedOutput = sanitizeMcpToolOutput(toolName, output);
  const meta = {
    ...extractMcpCallLogMeta(toolName, sanitizedInput, sanitizedOutput, error),
    ...metaOverride,
  };

  insertLog.run({
    toolName,
    input: JSON.stringify(sanitizedInput),
    output: sanitizedOutput !== null && sanitizedOutput !== undefined ? JSON.stringify(sanitizedOutput) : null,
    error,
    durationMs,
    sessionId: meta.session_id,
    activeBrain: meta.active_brain,
    actionType: meta.action_type,
    functionName: meta.function_name,
    transitionName: meta.transition_name,
    status: meta.status,
  });
}

export interface CallLog {
  id: number;
  timestamp: string;
  tool_name: string;
  input: string | null;
  output: string | null;
  error: string | null;
  duration_ms: number;
  session_id?: string | null;
  active_brain?: string | null;
  action_type?: string | null;
  function_name?: string | null;
  transition_name?: string | null;
  status?: string | null;
}

export function getLogs(limit = 50, sessionId?: string): CallLog[] {
  if (sessionId?.trim()) {
    return db
      .prepare(
        `SELECT * FROM call_logs
         WHERE session_id = @sessionId
         ORDER BY id ASC
         LIMIT @limit`
      )
      .all({ sessionId: sessionId.trim(), limit }) as unknown as CallLog[];
  }

  return db
    .prepare('SELECT * FROM call_logs ORDER BY id DESC LIMIT @limit')
    .all({ limit }) as unknown as CallLog[];
}

export function clearLogs(): void {
  db.prepare('DELETE FROM call_logs').run();
}

// ── Settings helpers ────────────────────────────────────────────────────

export function getSettings(): Record<string, string> {
  const rows = db
    .prepare('SELECT key, value FROM settings')
    .all() as unknown as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)').run({
    key,
    value,
  });
}

const selectProcessedPostCallAlert = db.prepare(`
  SELECT 1
  FROM processed_post_call_alerts
  WHERE call_id = @callId
  LIMIT 1
`);

const insertProcessedPostCallAlert = db.prepare(`
  INSERT OR REPLACE INTO processed_post_call_alerts (call_id)
  VALUES (@callId)
`);

export function hasProcessedPostCallAlert(callId: string): boolean {
  const row = selectProcessedPostCallAlert.get({ callId }) as { 1?: number } | undefined;
  return Boolean(row);
}

export function markProcessedPostCallAlert(callId: string): void {
  insertProcessedPostCallAlert.run({ callId });
}

export interface DashboardTestCase {
  id: number;
  name: string;
  tool_name: string;
  input_json: string;
  created_at: string;
  updated_at: string;
}

const selectDashboardTestCases = db.prepare(`
  SELECT *
  FROM dashboard_test_cases
  ORDER BY updated_at DESC, id DESC
`);

const insertDashboardTestCase = db.prepare(`
  INSERT INTO dashboard_test_cases (name, tool_name, input_json)
  VALUES (@name, @toolName, @inputJson)
`);

const updateDashboardTestCaseStatement = db.prepare(`
  UPDATE dashboard_test_cases
  SET
    name = @name,
    tool_name = @toolName,
    input_json = @inputJson,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = @id
`);

const deleteDashboardTestCaseStatement = db.prepare(`
  DELETE FROM dashboard_test_cases
  WHERE id = @id
`);

export function listDashboardTestCases(): DashboardTestCase[] {
  return selectDashboardTestCases.all() as unknown as DashboardTestCase[];
}

export function createDashboardTestCase(name: string, toolName: string, inputJson: string): number {
  const result = insertDashboardTestCase.run({ name, toolName, inputJson });
  return Number(result.lastInsertRowid);
}

export function updateDashboardTestCase(
  id: number,
  name: string,
  toolName: string,
  inputJson: string
): void {
  updateDashboardTestCaseStatement.run({ id, name, toolName, inputJson });
}

export function deleteDashboardTestCase(id: number): void {
  deleteDashboardTestCaseStatement.run({ id });
}

export interface PostCallAlertHistoryEntry {
  id: number;
  call_id: string | null;
  call_date: string | null;
  created_at: string;
  alert_required: number;
  email_sent: number;
  provider: string | null;
  subject: string | null;
  biggest_problem: string | null;
  email_text: string | null;
  reason: string | null;
  severity: string | null;
}

const insertPostCallAlertHistory = db.prepare(`
  INSERT INTO post_call_alert_history (
    call_id,
    call_date,
    alert_required,
    email_sent,
    provider,
    subject,
    biggest_problem,
    email_text,
    reason,
    severity
  ) VALUES (
    @callId,
    @callDate,
    @alertRequired,
    @emailSent,
    @provider,
    @subject,
    @biggestProblem,
    @emailText,
    @reason,
    @severity
  )
`);

const selectRecentPostCallAlerts = db.prepare(`
  SELECT *
  FROM post_call_alert_history
  ORDER BY id DESC
  LIMIT @limit
`);

export function recordPostCallAlertHistory(entry: {
  callId: string | null;
  callDate: string | null;
  alertRequired: boolean;
  emailSent: boolean;
  provider: string | null;
  subject: string | null;
  biggestProblem: string | null;
  emailText: string | null;
  reason: string | null;
  severity: string | null;
}): void {
  insertPostCallAlertHistory.run({
    callId: entry.callId,
    callDate: entry.callDate,
    alertRequired: entry.alertRequired ? 1 : 0,
    emailSent: entry.emailSent ? 1 : 0,
    provider: entry.provider,
    subject: entry.subject,
    biggestProblem: entry.biggestProblem,
    emailText: entry.emailText,
    reason: entry.reason,
    severity: entry.severity,
  });
}

export function listRecentPostCallAlerts(limit = 20): PostCallAlertHistoryEntry[] {
  return selectRecentPostCallAlerts.all({ limit }) as unknown as PostCallAlertHistoryEntry[];
}

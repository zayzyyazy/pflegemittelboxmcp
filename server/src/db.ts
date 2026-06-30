// Uses the Node.js built-in sqlite module (available in Node 22.5+, no npm package needed)
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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
`);

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
  INSERT INTO call_logs (tool_name, input, output, error, duration_ms)
  VALUES (@toolName, @input, @output, @error, @durationMs)
`);

export function logCall(
  toolName: string,
  input: unknown,
  output: unknown,
  error: string | null,
  durationMs: number
): void {
  insertLog.run({
    toolName,
    input: JSON.stringify(input),
    output: output !== null ? JSON.stringify(output) : null,
    error,
    durationMs,
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
}

export function getLogs(limit = 50): CallLog[] {
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

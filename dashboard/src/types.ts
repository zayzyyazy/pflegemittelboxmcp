export interface ToolDef {
  name: string;
  description: string;
  category: string;
  safe: boolean;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
}

export interface AddressVerificationGuardrailResult {
  plz: string | null;
  house_number: string | null;
  birthday: string | null;
  missing_fields: Array<'plz' | 'house_number' | 'birthday'>;
  confidence: 'high' | 'medium' | 'low';
  safe_to_lookup: boolean;
  next_action:
    | 'ask_plz'
    | 'ask_house_number'
    | 'ask_birthday'
    | 'confirm_values'
    | 'lookup'
    | 'fallback_to_vnr';
  say_hint: string;
  reason: string;
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

export interface Settings {
  mcp_url: string;
  env_label: string;
  leaping_mcp_url: string;
  leaping_agent_id: string;
}

export interface LeapingFunction {
  name: string;
  type: string;
  method: string;
  url: string;
  parameters: string[];
  notes: string;
  safe: boolean;
  productionChanging: boolean;
}

export interface ServerStatus {
  ok: boolean;
  service: string;
  version: string;
  env: string;
  node_env?: string;
  tool_count: number;
  uptime_s: number;
  tools?: string[];
  mcp_auth_enabled?: boolean;
  dashboard_auth_enabled?: boolean;
}

export interface PostCallMonitorStatus {
  enabled: boolean;
  running: boolean;
  interval_seconds: number | null;
  configured_agent_id: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_ok: boolean | null;
  last_error: string | null;
  last_summary: {
    ok: boolean;
    fetched_calls: number;
    terminal_calls_seen: number;
    already_processed: number;
    processed_now: number;
    alerts_sent: number;
    alerts_skipped: number;
    started_at: string;
    finished_at: string;
  } | null;
}

export type PostCallMonitorRunSummary = NonNullable<PostCallMonitorStatus['last_summary']>;

export interface DashboardTestCase {
  id: number;
  name: string;
  tool_name: string;
  input: Record<string, unknown>;
  created_at: string;
  updated_at: string;
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

export interface ServerRuntime {
  node_version: string;
  pid: number;
  platform: string;
  uptime_s: number;
  cwd: string;
  pm2: {
    available: boolean;
    process: unknown;
    error: string | null;
  };
}

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
  tool_count: number;
  uptime_s: number;
}

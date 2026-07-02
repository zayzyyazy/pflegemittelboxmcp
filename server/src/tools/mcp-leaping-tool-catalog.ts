/**
 * Tools exposed to Leaping via MCP tools/list (Streamable HTTP + legacy SSE).
 * Internal/dev tools remain available through the dashboard and REST API only.
 */
export const LEAPING_MCP_TOOL_NAMES = [
  'pmb_verification_method_router',
  'pmb_verification_phone_brain',
  'pmb_verification_address_brain',
  'pmb_verification_vnr_brain',
  'pmb_delivery_status_reasoner',
  'pmb_post_call_email_notifier',
  'pmb_debug_echo_session_only',
] as const;

export type LeapingMcpToolName = (typeof LEAPING_MCP_TOOL_NAMES)[number];

export interface McpToolDefinition {
  name: LeapingMcpToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export function isLeapingVisibleMcpTool(name: string): name is LeapingMcpToolName {
  return (LEAPING_MCP_TOOL_NAMES as readonly string[]).includes(name);
}

export const LEAPING_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'pmb_verification_method_router',
    description:
      'Clone-only verification method router. Runs after intent detection and before Kundenidentifikation. ' +
      'Chooses phone, address, or VNR path and stores it in MCP session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
        latest_customer_input: { type: 'string', description: 'Customer answer when choosing verification method.' },
        phone_lookup_found: { type: 'string', description: 'Result of get_customer_by_phone.' },
        id_phone: { type: 'string', description: 'Customer id from get_customer_by_phone.' },
        id: { type: 'string', description: 'Customer id populated after get_customer_by_phone.' },
        get_customer_by_phone_result: { type: 'string', description: 'Native get_customer_by_phone result.' },
        customer_intent: { type: 'string', description: 'Optional intent label from Leaping.' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_phone_brain',
    description:
      'Deterministic phone verification controller. Use only after get_customer_by_phone already found a customer.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        phone_lookup_found: { type: 'boolean' },
        id_phone: { type: 'string', description: 'Customer id from get_customer_by_phone.' },
        latest_customer_input: { type: 'string' },
        birthday_customer: { type: 'string' },
        check_birthday_result: { type: 'string' },
        check_birthday_error: { type: 'string' },
        birthday_system_available: { type: 'boolean' },
        birthday_request_count: { type: 'number' },
        birthday_check_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_address_brain',
    description:
      'Deterministic address fallback verification controller for PLZ + house number + birthday.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        phone_lookup_found: { type: 'boolean' },
        id_phone: { type: 'string', description: 'Customer id from get_customer_by_phone.' },
        latest_customer_input: { type: 'string' },
        plz: { type: 'string' },
        house_number: { type: 'string' },
        birthday_customer: { type: 'string' },
        get_customer_by_plz_geb_result: { type: 'string' },
        address_lookup_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_vnr_brain',
    description:
      'Deterministic VNR verification controller that blocks birthday check before customer lookup.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        latest_customer_input: { type: 'string' },
        vnr_raw: { type: 'string' },
        vnr_candidate: { type: 'string' },
        vnr_confirmed: { type: 'boolean' },
        check_insurance_number_format_result: { type: 'string' },
        get_customer_by_insurance_number_result: { type: 'string' },
        birthday_customer: { type: 'string' },
        check_birthday_result: { type: 'string' },
        check_birthday_error: { type: 'string' },
        birthday_system_available: { type: 'boolean' },
        vnr_request_count: { type: 'number' },
        vnr_lookup_attempts: { type: 'number' },
        birthday_request_count: { type: 'number' },
        birthday_check_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_delivery_status_reasoner',
    description:
      'Deterministic delivery-status reasoner for Pflegebox answers based on status, approval, and shipment history.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        box_genehmigt: { type: 'string' },
        letzte_box: { type: 'array' },
        gen_pg54_ab: { type: 'string' },
        gen_pg51_ab: { type: 'string' },
        requested_month: { type: 'string' },
        now: { type: 'string' },
        vip: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_post_call_email_notifier',
    description:
      'Runs post-call alert detection, formats a human-readable email, and sends it when an alert is required.',
    inputSchema: {
      type: 'object',
      properties: {
        call_id: { type: 'string' },
        call_date: { type: 'string' },
        duration_seconds: { type: 'number' },
        call_status: { type: 'string' },
        authenticated: { type: 'boolean' },
        verification_successful: { type: 'boolean' },
        transcript_text: { type: 'string' },
        function_calls: { type: 'array' },
        transitions: { type: 'array' },
        detected_events: { type: 'object' },
        to_email: { type: 'string' },
        dry_run: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_debug_echo_session_only',
    description:
      'Clone-only session binding smoke test after get_customer_by_phone. ' +
      'Verifies session_id binding and optional id_phone without LLM-filled extras.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
        id_phone: { type: 'string', description: 'Customer id from get_customer_by_phone.' },
        phone_lookup_found: { type: 'string', description: 'Phone lookup result or explicit flag.' },
      },
      required: [],
    },
  },
];

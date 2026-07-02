/**
 * MCP server factory.
 *
 * Do NOT export a singleton McpServer. The SDK's internal Protocol class throws
 * "Already connected to a transport" if connect() is called on the same instance
 * twice. Always call createMcpServer() to get a fresh instance per connection.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { runDeliveryStatusReasoner } from './tools/delivery-status-reasoner.js';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './tools/verification-method-router.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './tools/verification-method-brains.js';
import {
  toLeapingLegacyCoreResponse,
  toLoggedVerificationBrainResponse,
} from './tools/verification-brain-response.js';
import { logCall } from './db.js';

// Active legacy SSE sessions — used by POST /mcp/messages
export const sseTransports: Record<string, SSEServerTransport> = {};

/**
 * Create a fresh McpServer with Leaping-visible tools only.
 * One instance per SSE connection; discard after the connection closes.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pflegemittelbox-mcp',
    version: '0.1.0',
  });

  server.tool(
    'pmb_verification_method_router',
    'Clone-only verification method router. Runs after intent detection and before Kundenidentifikation. ' +
      'Chooses phone, address, or VNR path and stores it in MCP session. Does not perform CRM lookups.',
    {
      session_id: z
        .string()
        .optional()
        .describe('Stable call session id (leaping_conversation_id_hex).'),
      latest_customer_input: z
        .string()
        .optional()
        .describe('Customer answer when choosing verification method (VNR vs address).'),
      phone_lookup_found: z
        .union([z.boolean(), z.string()])
        .optional()
        .describe('Result of get_customer_by_phone: true/false or customer id when found.'),
      id_phone: z
        .string()
        .optional()
        .describe('Customer id from get_customer_by_phone when Leaping binds id_phone instead of phone_lookup_found.'),
      id: z
        .string()
        .optional()
        .describe('Customer id populated after get_customer_by_phone. Non-empty means phone lookup found.'),
      get_customer_by_phone_result: z
        .string()
        .optional()
        .describe('Native get_customer_by_phone result or error text (e.g. Kein Kunde gefunden).'),
      customer_intent: z
        .string()
        .optional()
        .describe('Optional intent label from Leaping (e.g. box_change, delivery_status).'),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationMethodRouterInput(input);
      const result = runVerificationMethodRouter(coerced);
      logCall('pmb_verification_method_router', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_verification_phone_brain',
    'Deterministic phone verification step controller. Use only after get_customer_by_phone already found a customer.',
    {
      session_id: z.string().optional(),
      phone_lookup_found: z.boolean().optional(),
      id_phone: z
        .string()
        .optional()
        .describe('Customer id from get_customer_by_phone when Leaping binds id_phone.'),
      latest_customer_input: z.string().optional(),
      birthday_customer: z.string().optional(),
      check_birthday_result: z.enum(['success', 'failed', 'error', 'not_called']).optional(),
      check_birthday_error: z.string().optional(),
      birthday_system_available: z.boolean().optional(),
      birthday_request_count: z.number().optional(),
      birthday_check_attempts: z.number().optional(),
      customer_requested_human: z.boolean().optional(),
      office_hours: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationPhoneBrainInput(input);
      const result = runVerificationPhoneBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_phone_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'pmb_verification_address_brain',
    'Deterministic address fallback verification step controller for PLZ + house number + birthday.',
    {
      session_id: z.string().optional(),
      phone_lookup_found: z.boolean().optional(),
      id_phone: z
        .string()
        .optional()
        .describe('Customer id from get_customer_by_phone when Leaping binds id_phone.'),
      latest_customer_input: z.string().optional(),
      plz: z.string().optional(),
      house_number: z.string().optional(),
      birthday_customer: z.string().optional(),
      get_customer_by_plz_geb_result: z
        .enum(['found', 'not_found', 'error', 'not_called'])
        .optional(),
      address_lookup_attempts: z.number().optional(),
      customer_requested_human: z.boolean().optional(),
      office_hours: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationAddressBrainInput(input);
      const result = runVerificationAddressBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_address_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'pmb_verification_vnr_brain',
    'Deterministic VNR verification step controller that enforces the safe order: confirm VNR, format check, customer lookup, then birthday check.',
    {
      session_id: z.string().optional(),
      latest_customer_input: z.string().optional(),
      vnr_raw: z.string().optional(),
      vnr_candidate: z.string().optional(),
      vnr_confirmed: z.boolean().optional(),
      check_insurance_number_format_result: z
        .enum(['valid', 'invalid', 'error', 'not_called'])
        .optional(),
      get_customer_by_insurance_number_result: z
        .enum(['found', 'not_found', 'error', 'not_called'])
        .optional(),
      birthday_customer: z.string().optional(),
      check_birthday_result: z.enum(['success', 'failed', 'error', 'not_called']).optional(),
      check_birthday_error: z.string().optional(),
      birthday_system_available: z.boolean().optional(),
      vnr_request_count: z.number().optional(),
      vnr_lookup_attempts: z.number().optional(),
      birthday_request_count: z.number().optional(),
      birthday_check_attempts: z.number().optional(),
      customer_requested_human: z.boolean().optional(),
      office_hours: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationVnrBrainInput(input);
      const result = runVerificationVnrBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_vnr_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(toLeapingLegacyCoreResponse(result), null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    'pmb_delivery_status_reasoner',
    'Deterministic delivery-status reasoner for Pflegebox answers. ' +
      'Returns a safe exact answer based only on current status, approval, and shipment history.',
    {
      status: z.string().optional(),
      box_genehmigt: z.string().optional(),
      letzte_box: z.union([z.string(), z.array(z.string())]).optional(),
      gen_pg54_ab: z.string().optional(),
      gen_pg51_ab: z.string().optional(),
      requested_month: z.string().optional(),
      now: z.string().optional(),
      vip: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const result = runDeliveryStatusReasoner(input);
      logCall('pmb_delivery_status_reasoner', input, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

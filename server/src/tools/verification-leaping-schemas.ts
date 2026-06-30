/** Leaping-facing MCP tool input schemas — minimal external fields only. */

import { z } from 'zod';

export const LEAPING_VERIFICATION_METHOD_ROUTER_SCHEMA = {
  type: 'object' as const,
  properties: {
    session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
    latest_customer_input: {
      type: 'string',
      description: 'Customer answer when choosing verification method (VNR vs address).',
    },
    phone_lookup_found: {
      type: 'boolean',
      description: 'Result of get_customer_by_phone at call start.',
    },
  },
  required: [] as string[],
};

export const LEAPING_VERIFICATION_BRAIN_SCHEMA = {
  type: 'object' as const,
  properties: {
    session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
    latest_customer_input: {
      type: 'string',
      description: 'Customer answer to the current verification question only.',
    },
    phone_lookup_found: {
      type: 'boolean',
      description: 'Whether get_customer_by_phone found a customer at call start.',
    },
    get_customer_by_plz_geb_result: {
      type: 'string',
      description: 'Native get_customer_by_plz_geb result summary.',
    },
    get_customer_by_insurance_number_result: {
      type: 'string',
      description: 'Native get_customer_by_insurance_number result summary.',
    },
    check_insurance_number_format_result: {
      type: 'string',
      description: 'Native check_insurance_number_format result summary.',
    },
    check_birthday_result: {
      type: 'string',
      description: 'Native check_birthday result summary.',
    },
    check_birthday_error: {
      type: 'string',
      description: 'Native check_birthday error message, if any.',
    },
  },
  required: [] as string[],
};

export const leapingVerificationMethodRouterZod = {
  session_id: z.string().optional(),
  latest_customer_input: z.string().optional(),
  phone_lookup_found: z.boolean().optional(),
};

export const leapingVerificationBrainZod = {
  session_id: z.string().optional(),
  latest_customer_input: z.string().optional(),
  phone_lookup_found: z.boolean().optional(),
  get_customer_by_plz_geb_result: z
    .enum(['found', 'not_found', 'error', 'not_called'])
    .optional(),
  get_customer_by_insurance_number_result: z
    .enum(['found', 'not_found', 'error', 'not_called'])
    .optional(),
  check_insurance_number_format_result: z
    .enum(['valid', 'invalid', 'error', 'not_called'])
    .optional(),
  check_birthday_result: z.enum(['success', 'failed', 'error', 'not_called']).optional(),
  check_birthday_error: z.string().optional(),
};

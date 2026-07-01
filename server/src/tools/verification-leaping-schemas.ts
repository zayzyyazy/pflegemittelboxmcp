/** Leaping-facing MCP tool input schemas — minimal external fields only. */

import { z } from 'zod';

const lookupResultFieldSchema = {
  type: 'string' as const,
  description:
    'Native lookup result summary (found | not_found | error) or CRM object. Prefer binding function output here when possible.',
};

const customerIdFieldSchema = {
  type: 'string' as const,
  description: 'Customer id field updated by Leaping after a successful CRM lookup (e.g. id, id_phone).',
};

const birthdaySystemFieldSchema = {
  type: 'string' as const,
  description:
    'CRM birthday_system value populated after customer lookup. Comparison target only — not customer authentication.',
};

export const LEAPING_VERIFICATION_METHOD_ROUTER_SCHEMA = {
  type: 'object' as const,
  properties: {
    session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
    latest_customer_input: {
      type: 'string',
      description: 'Customer answer when choosing verification method (VNR vs address).',
    },
    phone_lookup_found: {
      type: 'string',
      description:
        'Result of get_customer_by_phone: true/false, or non-empty customer id when phone lookup found a customer.',
    },
    id_phone: {
      ...customerIdFieldSchema,
      description: 'Customer id from get_customer_by_phone when Leaping binds id_phone instead of phone_lookup_found.',
    },
    id: {
      ...customerIdFieldSchema,
      description: 'Customer id populated after get_customer_by_phone. Non-empty means phone lookup found.',
    },
    get_customer_by_phone_result: {
      ...lookupResultFieldSchema,
      description: 'Native get_customer_by_phone result or error text (e.g. Kein Kunde gefunden).',
    },
    customer_intent: {
      type: 'string',
      description: 'Optional intent label from Leaping (e.g. box_change, delivery_status).',
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
      type: 'string',
      description: 'Whether get_customer_by_phone found a customer at call start.',
    },
    get_customer_by_plz_geb_result: {
      ...lookupResultFieldSchema,
      description: 'Native get_customer_by_plz_geb result summary or CRM object.',
    },
    get_customer_by_insurance_number_result: {
      ...lookupResultFieldSchema,
      description:
        'Native get_customer_by_insurance_number result. Bind function output here after VNR lookup. ' +
        'Accepts found | not_found | error | CRM object.',
    },
    id: {
      ...customerIdFieldSchema,
      description:
        'Fallback: customer id updated by Leaping after get_customer_by_insurance_number when result field is not bound.',
    },
    customer_id: {
      ...customerIdFieldSchema,
      description: 'Fallback customer id alias for Leaping field bindings.',
    },
    birthday_system: {
      ...birthdaySystemFieldSchema,
    },
    birthday_system_available: {
      type: 'boolean',
      description:
        'True when birthday_system is available for check_birthday after customer provides their birthday.',
    },
    birthday_customer: {
      type: 'string',
      description: 'Customer-provided birthday for authentication (not CRM birthday_system).',
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

export const LEAPING_VERIFICATION_VNR_BRAIN_SCHEMA = {
  type: 'object' as const,
  properties: {
    session_id: { type: 'string', description: 'Stable call session id (leaping_conversation_id_hex).' },
    latest_customer_input: {
      type: 'string',
      description: 'Customer answer to the current VNR verification question only.',
    },
    vnr_candidate: { type: 'string', description: 'Normalized VNR candidate if already known.' },
    vnr_confirmed: { type: 'boolean', description: 'Whether the customer confirmed the VNR candidate.' },
    get_customer_by_insurance_number_result: {
      ...lookupResultFieldSchema,
      description:
        'Bind get_customer_by_insurance_number output here after the native call. ' +
        'Required for MCP to continue to birthday authentication.',
    },
    id: {
      ...customerIdFieldSchema,
      description:
        'Fallback when Leaping updates id after get_customer_by_insurance_number but does not bind the result field.',
    },
    customer_id: {
      ...customerIdFieldSchema,
      description: 'Fallback customer id alias.',
    },
    birthday_system: {
      ...birthdaySystemFieldSchema,
    },
    birthday_system_available: {
      type: 'boolean',
      description: 'True when birthday_system is populated and check_birthday can run.',
    },
    birthday_customer: {
      type: 'string',
      description: 'Customer-provided birthday speech value only — not CRM birthday_system.',
    },
    check_birthday_result: {
      type: 'string',
      description: 'Native check_birthday result after MCP requested check_birthday.',
    },
    check_birthday_error: { type: 'string', description: 'Native check_birthday error message, if any.' },
  },
  required: [] as string[],
};

const lookupResultZod = z.union([
  z.enum(['found', 'not_found', 'error', 'not_called']),
  z.record(z.unknown()),
  z.boolean(),
  z.string(),
]);

export const leapingVerificationMethodRouterZod = {
  session_id: z.string().optional(),
  latest_customer_input: z.string().optional(),
  phone_lookup_found: z.union([z.boolean(), z.string()]).optional(),
  id_phone: z.union([z.string(), z.number()]).optional(),
  id: z.union([z.string(), z.number()]).optional(),
  get_customer_by_phone_result: lookupResultZod.optional(),
  customer_intent: z.string().optional(),
};

export const leapingVerificationBrainZod = {
  session_id: z.string().optional(),
  latest_customer_input: z.string().optional(),
  phone_lookup_found: z.union([z.boolean(), z.string()]).optional(),
  get_customer_by_plz_geb_result: lookupResultZod.optional(),
  get_customer_by_insurance_number_result: lookupResultZod.optional(),
  id: z.union([z.string(), z.number()]).optional(),
  customer_id: z.union([z.string(), z.number()]).optional(),
  birthday_system: z.union([z.string(), z.boolean()]).optional(),
  birthday_system_available: z.boolean().optional(),
  birthday_customer: z.string().optional(),
  check_birthday_result: z.union([
    z.enum(['success', 'failed', 'error', 'not_called']),
    z.boolean(),
  ]).optional(),
  check_birthday_error: z.string().optional(),
};

export const leapingVerificationVnrBrainZod = {
  session_id: z.string().optional(),
  latest_customer_input: z.string().optional(),
  vnr_candidate: z.string().optional(),
  vnr_confirmed: z.boolean().optional(),
  get_customer_by_insurance_number_result: lookupResultZod.optional(),
  id: z.union([z.string(), z.number()]).optional(),
  customer_id: z.union([z.string(), z.number()]).optional(),
  birthday_system: z.union([z.string(), z.boolean()]).optional(),
  birthday_system_available: z.boolean().optional(),
  birthday_customer: z.string().optional(),
  check_birthday_result: z.union([
    z.enum(['success', 'failed', 'error', 'not_called']),
    z.boolean(),
  ]).optional(),
  check_birthday_error: z.string().optional(),
};

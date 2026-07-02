/**
 * Run before Marie/Leaping tests. Simulates Leaping JSON payloads step-by-step.
 * Usage: node --import tsx src/tools/verification-deployment-preflight.ts
 */
import {
  runDebugEchoSessionOnly,
} from './debug-echo-session.js';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './verification-method-router.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLeapingLegacyCoreResponse } from './verification-brain-response.js';

type Expect = {
  next_action?: string;
  next_brain?: string | null;
  allowed_to_call_function?: boolean;
  function_to_call?: string | null;
  allowed_to_transition?: boolean;
  transition_to?: string | null;
  say_contains?: string;
  session_mode?: string;
  inferred_phone_lookup_found?: boolean;
};

type Step = {
  label: string;
  tool: string;
  input: Record<string, unknown>;
  expect: Expect;
};

type Scenario = {
  id: string;
  session_id: string;
  steps: Step[];
};

function runTool(tool: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (tool) {
    case 'pmb_debug_echo_session_only':
      return runDebugEchoSessionOnly({
        session_id: input.session_id as string | undefined,
        id_phone: input.id_phone as string | undefined,
        phone_lookup_found: input.phone_lookup_found as string | boolean | undefined,
      }) as unknown as Record<string, unknown>;
    case 'pmb_verification_method_router':
      return runVerificationMethodRouter(
        coerceVerificationMethodRouterInput(input)
      ) as unknown as Record<string, unknown>;
    case 'pmb_verification_phone_brain':
      return toLeapingLegacyCoreResponse(
        runVerificationPhoneBrain(coerceVerificationPhoneBrainInput(input))
      ) as Record<string, unknown>;
    case 'pmb_verification_address_brain':
      return toLeapingLegacyCoreResponse(
        runVerificationAddressBrain(coerceVerificationAddressBrainInput(input))
      ) as Record<string, unknown>;
    case 'pmb_verification_vnr_brain':
      return toLeapingLegacyCoreResponse(
        runVerificationVnrBrain(coerceVerificationVnrBrainInput(input))
      ) as Record<string, unknown>;
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

function assertExpect(step: Step, out: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const e = step.expect;
  for (const key of [
    'next_action',
    'next_brain',
    'function_to_call',
    'transition_to',
    'session_mode',
  ] as const) {
    if (e[key] !== undefined && out[key] !== e[key]) {
      errors.push(`${key}: expected ${JSON.stringify(e[key])}, got ${JSON.stringify(out[key])}`);
    }
  }
  for (const key of ['allowed_to_call_function', 'allowed_to_transition', 'inferred_phone_lookup_found'] as const) {
    if (e[key] !== undefined && out[key] !== e[key]) {
      errors.push(`${key}: expected ${e[key]}, got ${out[key]}`);
    }
  }
  if (e.say_contains && !String(out.say ?? '').includes(e.say_contains)) {
    errors.push(`say missing "${e.say_contains}" (got: ${JSON.stringify(out.say)})`);
  }
  return errors;
}

export const DEPLOYMENT_SCENARIOS: Scenario[] = [
  {
    id: 'A-echo-phone-found',
    session_id: 'preflight-echo-001',
    steps: [
      {
        label: 'After get_customer_by_phone',
        tool: 'pmb_debug_echo_session_only',
        input: { session_id: 'preflight-echo-001', id_phone: '107484' },
        expect: {
          session_mode: 'session',
          inferred_phone_lookup_found: true,
        },
      },
    ],
  },
  {
    id: 'A-router-phone-found',
    session_id: 'preflight-router-phone',
    steps: [
      {
        label: 'Router with id_phone',
        tool: 'pmb_verification_method_router',
        input: { session_id: 'preflight-router-phone', id_phone: '107484' },
        expect: { next_brain: 'pmb_verification_phone_brain' },
      },
    ],
  },
  {
    id: 'A-router-method-choice',
    session_id: 'preflight-router-choice',
    steps: [
      {
        label: 'Router no phone',
        tool: 'pmb_verification_method_router',
        input: {
          session_id: 'preflight-router-choice',
          customer_intent: 'box_change',
        },
        expect: {
          next_brain: null,
          say_contains: 'Versichertennummer',
        },
      },
    ],
  },
  {
    id: 'B-phone-happy-path',
    session_id: 'preflight-phone-001',
    steps: [
      {
        label: 'Phone brain start',
        tool: 'pmb_verification_phone_brain',
        input: { session_id: 'preflight-phone-001', id_phone: '107484' },
        expect: {
          next_action: 'ASK_BIRTHDAY',
          allowed_to_call_function: false,
          say_contains: 'Geburtsdatum',
        },
      },
      {
        label: 'Birthday spoken',
        tool: 'pmb_verification_phone_brain',
        input: {
          session_id: 'preflight-phone-001',
          id_phone: '107484',
          latest_customer_input: '16. März 1956',
          birthday_system_available: true,
        },
        expect: {
          next_action: 'CALL_CHECK_BIRTHDAY',
          allowed_to_call_function: true,
          function_to_call: 'check_birthday',
        },
      },
      {
        label: 'Birthday success',
        tool: 'pmb_verification_phone_brain',
        input: {
          session_id: 'preflight-phone-001',
          id_phone: '107484',
          check_birthday_result: 'success',
        },
        expect: {
          next_action: 'TRANSITION_WEITER',
          allowed_to_transition: true,
          transition_to: 'weiter',
        },
      },
    ],
  },
  {
    id: 'C-vnr-happy-path',
    session_id: 'preflight-vnr-001',
    steps: [
      {
        label: 'Typed VNR',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          latest_customer_input: 'E207064360',
        },
        expect: {
          next_action: 'CONFIRM_VNR',
          say_contains: 'E207064360',
        },
      },
      {
        label: 'Confirm ja',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          latest_customer_input: 'ja',
        },
        expect: {
          next_action: 'CALL_CHECK_INSURANCE_NUMBER_FORMAT',
          allowed_to_call_function: true,
          function_to_call: 'check_insurance_number_format',
        },
      },
      {
        label: 'Format valid',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          check_insurance_number_format_result: 'valid',
        },
        expect: {
          next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER',
          allowed_to_call_function: true,
          function_to_call: 'get_customer_by_insurance_number',
        },
      },
      {
        label: 'Lookup found — must ask birthday NOT weiter',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          get_customer_by_insurance_number_result: 'found',
        },
        expect: {
          next_action: 'ASK_BIRTHDAY',
          allowed_to_transition: false,
          say_contains: 'Geburtsdatum',
        },
      },
      {
        label: 'Spoken birthday',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          latest_customer_input: 'sechzehnter März neunzehnhundertsechsundfünfzig',
          birthday_system_available: true,
        },
        expect: {
          next_action: 'CALL_CHECK_BIRTHDAY',
          function_to_call: 'check_birthday',
        },
      },
      {
        label: 'Birthday success',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-001',
          check_birthday_result: 'success',
        },
        expect: {
          next_action: 'TRANSITION_WEITER',
          transition_to: 'weiter',
        },
      },
    ],
  },
  {
    id: 'C-vnr-failed-birthday-retry',
    session_id: 'preflight-vnr-retry',
    steps: [
      {
        label: 'Setup through lookup',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-retry',
          latest_customer_input: 'E207064360',
        },
        expect: { next_action: 'CONFIRM_VNR' },
      },
      {
        label: 'Confirm',
        tool: 'pmb_verification_vnr_brain',
        input: { session_id: 'preflight-vnr-retry', latest_customer_input: 'ja' },
        expect: { next_action: 'CALL_CHECK_INSURANCE_NUMBER_FORMAT' },
      },
      {
        label: 'Format valid',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-retry',
          check_insurance_number_format_result: 'valid',
        },
        expect: { next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER' },
      },
      {
        label: 'Lookup found',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-retry',
          get_customer_by_insurance_number_result: 'found',
        },
        expect: { next_action: 'ASK_BIRTHDAY' },
      },
      {
        label: 'Failed birthday without stored value',
        tool: 'pmb_verification_vnr_brain',
        input: {
          session_id: 'preflight-vnr-retry',
          check_birthday_result: 'failed',
        },
        expect: {
          next_action: 'ASK_BIRTHDAY',
          say_contains: 'konnte ich leider nicht bestätigen',
        },
      },
    ],
  },
  {
    id: 'D-address-plz-flow',
    session_id: 'preflight-address-001',
    steps: [
      {
        label: 'Router picks address',
        tool: 'pmb_verification_method_router',
        input: {
          session_id: 'preflight-address-001',
          latest_customer_input: 'über die Postleitzahl',
        },
        expect: { next_brain: 'pmb_verification_address_brain' },
      },
      {
        label: 'Ask PLZ',
        tool: 'pmb_verification_address_brain',
        input: { session_id: 'preflight-address-001', phone_lookup_found: false },
        expect: { next_action: 'ASK_PLZ', say_contains: 'Postleitzahl' },
      },
      {
        label: 'PLZ given',
        tool: 'pmb_verification_address_brain',
        input: {
          session_id: 'preflight-address-001',
          latest_customer_input: '41372',
        },
        expect: { next_action: 'ASK_HOUSE_NUMBER' },
      },
      {
        label: 'House number spoken',
        tool: 'pmb_verification_address_brain',
        input: {
          session_id: 'preflight-address-001',
          latest_customer_input: 'eins null null',
        },
        expect: { next_action: 'ASK_BIRTHDAY' },
      },
    ],
  },
];

function main() {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  console.log('=== Deployment preflight (Leaping JSON simulation) ===\n');

  for (const scenario of DEPLOYMENT_SCENARIOS) {
    console.log(`## ${scenario.id} (session: ${scenario.session_id})`);
    for (const step of scenario.steps) {
      const input = { ...step.input, session_id: step.input.session_id ?? scenario.session_id };
      const out = runTool(step.tool, input);
      const errors = assertExpect(step, out);
      const status = errors.length === 0 ? 'PASS' : 'FAIL';
      if (errors.length === 0) passed++;
      else {
        failed++;
        failures.push(`${scenario.id} / ${step.label}: ${errors.join('; ')}`);
      }
      console.log(`  [${status}] ${step.label}`);
      console.log(`    tool: ${step.tool}`);
      console.log(`    in:   ${JSON.stringify(input)}`);
      console.log(`    out:  ${JSON.stringify(out, null, 0).slice(0, 200)}...`);
      if (errors.length) console.log(`    !! ${errors.join('; ')}`);
    }
    console.log('');
  }

  console.log(`=== ${passed} passed, ${failed} failed ===`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main();

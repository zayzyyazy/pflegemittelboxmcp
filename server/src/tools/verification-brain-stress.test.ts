import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
  type VerificationAddressBrainInput,
  type VerificationMethodBrainResult,
  type VerificationPhoneBrainInput,
  type VerificationVnrBrainInput,
} from './verification-method-brains.js';

type BrainName = 'address' | 'phone' | 'vnr';

const ADDRESS_ILLEGAL = new Set([
  'check_birthday',
  'check_insurance_number_format',
  'get_customer_by_insurance_number',
]);
const PHONE_ILLEGAL = new Set(['get_customer_by_plz_geb', 'check_insurance_number_format', 'get_customer_by_insurance_number']);
const VNR_ILLEGAL = new Set(['get_customer_by_plz_geb']);

interface ScenarioStep {
  label?: string;
  brain?: BrainName;
  input: Record<string, unknown>;
}

interface ScenarioExpectation {
  action_type?: string;
  next_action?: string;
  awaiting_field?: string | null;
  function_name?: string | null;
  transition_name?: string | null;
  stored_plz?: string | null;
  stored_house_number?: string | null;
  stored_birthday?: string | null;
  stored_vnr?: string | null;
  function_arguments?: Record<string, string> | null;
  safety_flag?: string;
  never_function?: string;
  min_attempts?: Partial<Record<string, number>>;
  custom?: (result: VerificationMethodBrainResult, history: VerificationMethodBrainResult[]) => string | null;
}

interface StressScenario {
  id: number;
  group: string;
  name: string;
  session_id?: string;
  brain: BrainName;
  steps: ScenarioStep[];
  expect: ScenarioExpectation;
}

interface StressReport {
  id: number;
  group: string;
  name: string;
  status: 'PASS' | 'FAIL';
  failures: string[];
  suspicious: string[];
  final: VerificationMethodBrainResult;
  history: VerificationMethodBrainResult[];
}

function runBrain(brain: BrainName, input: Record<string, unknown>): VerificationMethodBrainResult {
  if (brain === 'address') return runVerificationAddressBrain(input as VerificationAddressBrainInput);
  if (brain === 'phone') return runVerificationPhoneBrain(input as VerificationPhoneBrainInput);
  return runVerificationVnrBrain(input as VerificationVnrBrainInput);
}

function illegalFunctionsFor(brain: BrainName): Set<string> {
  if (brain === 'address') return ADDRESS_ILLEGAL;
  if (brain === 'phone') return PHONE_ILLEGAL;
  return VNR_ILLEGAL;
}

function runStressScenario(scenario: StressScenario): StressReport {
  const history: VerificationMethodBrainResult[] = [];
  let last = runBrain(scenario.brain, {});

  for (const step of scenario.steps) {
    const brain = step.brain ?? scenario.brain;
    const payload = {
      ...(scenario.session_id ? { session_id: scenario.session_id } : {}),
      ...step.input,
    };
    last = runBrain(brain, payload);
    history.push(last);

    const illegal = illegalFunctionsFor(brain);
    if (last.function_to_call && illegal.has(last.function_to_call)) {
      return {
        id: scenario.id,
        group: scenario.group,
        name: scenario.name,
        status: 'FAIL',
        failures: [`illegal function allowed: ${last.function_to_call} on ${brain} path`],
        suspicious: [],
        final: last,
        history,
      };
    }
    if (last.action_type === 'CALL_FUNCTION' && !last.function_to_call) {
      return {
        id: scenario.id,
        group: scenario.group,
        name: scenario.name,
        status: 'FAIL',
        failures: ['CALL_FUNCTION action_type without function_to_call'],
        suspicious: [],
        final: last,
        history,
      };
    }
  }

  const failures: string[] = [];
  const suspicious: string[] = [];
  const e = scenario.expect;
  const r = last;

  const check = (cond: boolean, msg: string) => {
    if (!cond) failures.push(msg);
  };

  if (e.action_type) check(r.action_type === e.action_type, `action_type expected ${e.action_type}, got ${r.action_type}`);
  if (e.next_action) check(r.next_action === e.next_action, `next_action expected ${e.next_action}, got ${r.next_action}`);
  if (e.awaiting_field !== undefined) {
    check(r.awaiting_field === e.awaiting_field, `awaiting_field expected ${String(e.awaiting_field)}, got ${String(r.awaiting_field)}`);
  }
  if (e.function_name !== undefined) check(r.function_name === e.function_name, `function_name expected ${String(e.function_name)}, got ${String(r.function_name)}`);
  if (e.transition_name !== undefined) check(r.transition_name === e.transition_name, `transition_name expected ${String(e.transition_name)}, got ${String(r.transition_name)}`);
  if (e.stored_plz !== undefined) check(r.stored_values?.plz === e.stored_plz, `stored plz expected ${String(e.stored_plz)}, got ${String(r.stored_values?.plz)}`);
  if (e.stored_house_number !== undefined) {
    check(
      r.stored_values?.house_number === e.stored_house_number,
      `stored house_number expected ${String(e.stored_house_number)}, got ${String(r.stored_values?.house_number)}`
    );
  }
  if (e.stored_birthday !== undefined) {
    check(
      r.stored_values?.birthday_customer === e.stored_birthday,
      `stored birthday expected ${String(e.stored_birthday)}, got ${String(r.stored_values?.birthday_customer)}`
    );
  }
  if (e.stored_vnr !== undefined) check(r.stored_values?.vnr_candidate === e.stored_vnr, `stored vnr expected ${String(e.stored_vnr)}, got ${String(r.stored_values?.vnr_candidate)}`);
  if (e.function_arguments !== undefined) {
    check(
      JSON.stringify(r.function_arguments ?? null) === JSON.stringify(e.function_arguments),
      `function_arguments expected ${JSON.stringify(e.function_arguments)}, got ${JSON.stringify(r.function_arguments ?? null)}`
    );
  }
  if (e.safety_flag) check(r.safety_flags.includes(e.safety_flag), `expected safety flag ${e.safety_flag}`);
  if (e.never_function) check(r.function_to_call !== e.never_function && r.function_name !== e.never_function, `must not call ${e.never_function}`);
  if (e.min_attempts) {
    for (const [key, min] of Object.entries(e.min_attempts)) {
      const actual = (r.attempts as Record<string, number> | undefined)?.[key] ?? 0;
      check(actual >= min, `attempts.${key} expected >= ${min}, got ${actual}`);
    }
  }
  if (e.custom) {
    const customFailure = e.custom(r, history);
    if (customFailure) failures.push(customFailure);
  }

  if (r.action_type === 'CALL_FUNCTION' && r.function_arguments) {
    for (const value of Object.values(r.function_arguments)) {
      if (/\b(eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|null|hundert)\b/i.test(value)) {
        suspicious.push(`raw spoken token in function_arguments: ${value}`);
      }
    }
  }

  return {
    id: scenario.id,
    group: scenario.group,
    name: scenario.name,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    suspicious,
    final: r,
    history,
  };
}

const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 1,
    group: 'ADDRESS',
    name: 'wrong/incomplete PLZ then complete address',
    brain: 'address',
    session_id: 'stress-address-001',
    steps: [
      { input: { phone_lookup_found: false, latest_customer_input: 'eins drei sieben zwei' } },
      { input: { latest_customer_input: 'vier eins drei sieben zwei' } },
      { input: { latest_customer_input: 'einhundert' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_plz: '41372',
      stored_house_number: '100',
      stored_birthday: '1956-03-16',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
      custom: (_r, history) => {
        const first = history[0];
        if (first.stored_values?.plz) return 'incomplete PLZ should not be stored on first turn';
        return null;
      },
    },
  },
  {
    id: 2,
    group: 'ADDRESS',
    name: 'repeated PLZ does not become house number',
    brain: 'address',
    session_id: 'stress-address-002',
    steps: [
      { input: { latest_customer_input: 'vier eins drei sieben zwei' } },
      { input: { latest_customer_input: 'vier eins drei sieben zwei' } },
    ],
    expect: { stored_plz: '41372', stored_house_number: null, next_action: 'ASK_HOUSE_NUMBER', awaiting_field: 'house_number' },
  },
  {
    id: 3,
    group: 'ADDRESS',
    name: 'house number before PLZ rejected',
    brain: 'address',
    session_id: 'stress-address-003',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: 'einhundert' } }],
    expect: { next_action: 'ASK_PLZ', stored_plz: null, stored_house_number: null, awaiting_field: 'plz' },
  },
  {
    id: 4,
    group: 'ADDRESS',
    name: 'birthday before PLZ rejected',
    brain: 'address',
    session_id: 'stress-address-004',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: '16.03.1956' } }],
    expect: { next_action: 'ASK_PLZ', stored_plz: null, stored_birthday: null, awaiting_field: 'plz' },
  },
  {
    id: 5,
    group: 'ADDRESS',
    name: 'PLZ then why-question keeps state',
    brain: 'address',
    session_id: 'stress-address-005',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: 'warum brauchen Sie das?' } },
    ],
    expect: { stored_plz: '41372', stored_house_number: null, next_action: 'ASK_HOUSE_NUMBER', awaiting_field: 'house_number' },
  },
  {
    id: 6,
    group: 'ADDRESS',
    name: 'street utterance normalizes house number',
    brain: 'address',
    session_id: 'stress-address-006',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: 'Meine Hausnummer ist Musterstraße einhundert B' } },
    ],
    expect: { stored_house_number: '100', next_action: 'ASK_BIRTHDAY' },
  },
  {
    id: 7,
    group: 'ADDRESS',
    name: 'hundert b then missing year then year completes lookup',
    brain: 'address',
    session_id: 'stress-address-007',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: 'hundert b' } },
      { input: { latest_customer_input: '16. März' } },
      { input: { latest_customer_input: 'neunzehnhundertsechsundfünfzig' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_birthday: '1956-03-16',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 8,
    group: 'ADDRESS',
    name: 'impossible birthday then correct birthday',
    brain: 'address',
    session_id: 'stress-address-008',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: '31. Februar 1956' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_birthday: '1956-03-16',
      custom: (_r, history) => (history[0].next_action === 'ASK_BIRTHDAY' ? null : 'expected ASK_BIRTHDAY after impossible date'),
    },
  },
  {
    id: 9,
    group: 'ADDRESS',
    name: 'future birthday then correct birthday',
    brain: 'address',
    session_id: 'stress-address-009',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: '16. März 2030' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_birthday: '1956-03-16',
      custom: (_r, history) =>
        history[0].stored_values?.birthday_customer === '2030-03-16' ? 'future birthday was stored' : null,
    },
  },
  {
    id: 10,
    group: 'ADDRESS',
    name: 'house number correction before birthday',
    brain: 'address',
    session_id: 'stress-address-010',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '100' } },
      { input: { latest_customer_input: 'nein, 101' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_house_number: '101',
      function_arguments: { plz: '41372', hnr: '101', bday: '1956-03-16' },
    },
  },
  {
    id: 11,
    group: 'ADDRESS',
    name: 'not_found then PLZ correction retry',
    brain: 'address',
    session_id: 'stress-address-011',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '100' } },
      { input: { latest_customer_input: '16.03.1956' } },
      { input: { get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' } } },
      { input: { latest_customer_input: 'nein PLZ war falsch' } },
      { input: { latest_customer_input: '22765' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_plz: '22765',
      function_arguments: { plz: '22765', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 12,
    group: 'ADDRESS',
    name: 'not_found then confirm same values retries lookup',
    brain: 'address',
    session_id: 'stress-address-012',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16' } },
      { input: { get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' } } },
      { input: { latest_customer_input: 'ja das stimmt' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
      min_attempts: { address_lookup_attempts: 1 },
    },
  },
  {
    id: 13,
    group: 'ADDRESS',
    name: 'double not_found falls back to VNR',
    brain: 'address',
    session_id: 'stress-address-013',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found', address_lookup_attempts: 2 } },
    ],
    expect: { next_action: 'FALLBACK_TO_VNR', never_function: 'get_customer_by_plz_geb' },
  },
  {
    id: 14,
    group: 'ADDRESS',
    name: 'raw object not_found normalized in session',
    brain: 'address',
    session_id: 'stress-address-014',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16' } },
      { input: { get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' } } },
    ],
    expect: {
      next_action: 'CONFIRM_ADDRESS_VALUES',
      custom: (r) =>
        typeof r.stored_values?.get_customer_by_plz_geb_result === 'object'
          ? 'raw object stored in session lookup result'
          : r.stored_values?.get_customer_by_plz_geb_result === 'not_found'
            ? null
            : `expected normalized not_found, got ${r.stored_values?.get_customer_by_plz_geb_result}`,
    },
  },
  {
    id: 15,
    group: 'ADDRESS',
    name: 'weird string not_found normalized',
    brain: 'address',
    session_id: 'stress-address-015',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'Kein Kunde gefunden' } },
    ],
    expect: { next_action: 'CONFIRM_ADDRESS_VALUES', custom: (r) => (r.stored_values?.get_customer_by_plz_geb_result === 'not_found' ? null : 'string not_found not normalized') },
  },
  {
    id: 16,
    group: 'PHONE',
    name: 'missing-year birthday then year before check',
    brain: 'phone',
    session_id: 'stress-phone-001',
    steps: [
      { input: { phone_lookup_found: true } },
      { input: { latest_customer_input: '16. März' } },
      { input: { latest_customer_input: 'neunzehnhundertsechsundfünfzig', birthday_system_available: true } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'check_birthday',
      custom: (_r, history) => {
        const premature = history.find((h) => h.function_to_call === 'check_birthday' && !h.stored_values?.birthday_customer);
        return premature ? 'check_birthday allowed before full birthday' : null;
      },
    },
  },
  {
    id: 17,
    group: 'PHONE',
    name: 'impossible birthday then correct before check',
    brain: 'phone',
    session_id: 'stress-phone-002',
    steps: [
      { input: { phone_lookup_found: true } },
      { input: { latest_customer_input: '31. Februar 1956' } },
      { input: { latest_customer_input: '16.03.1956', birthday_system_available: true } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'check_birthday',
      custom: (_r, history) => {
        const illegal = history.find((h) => h.function_to_call === 'check_birthday' && h.next_action !== 'CALL_CHECK_BIRTHDAY');
        return illegal ? 'check_birthday on impossible date step' : null;
      },
    },
  },
  {
    id: 18,
    group: 'PHONE',
    name: 'check_birthday false once retries birthday',
    brain: 'phone',
    session_id: 'stress-phone-003',
    steps: [
      { input: { phone_lookup_found: true, birthday_customer: '1956-03-16', birthday_system_available: true } },
      { input: { check_birthday_result: 'failed', birthday_check_attempts: 1 } },
    ],
    expect: { next_action: 'ASK_BIRTHDAY', never_function: 'check_birthday', transition_name: null },
  },
  {
    id: 19,
    group: 'PHONE',
    name: 'multiple failed birthday checks end nicht_identifiziert',
    brain: 'phone',
    session_id: 'stress-phone-004',
    steps: [
      { input: { phone_lookup_found: true, birthday_customer: '1956-03-16', check_birthday_result: 'failed', birthday_check_attempts: 2 } },
    ],
    expect: { next_action: 'TRANSITION_NICHT_IDENTIFIZIERT', transition_name: 'nicht_identifiziert', never_function: 'check_birthday' },
  },
  {
    id: 20,
    group: 'PHONE',
    name: 'missing birthday_system escalates',
    brain: 'phone',
    session_id: 'stress-phone-005',
    steps: [
      { input: { phone_lookup_found: true, birthday_customer: '1956-03-16', check_birthday_error: 'Missing field value: birthday_system' } },
    ],
    expect: { next_action: 'TECHNICAL_ESCALATION', action_type: 'ERROR', never_function: 'check_birthday', transition_name: null },
  },
  {
    id: 21,
    group: 'PHONE',
    name: 'function-result-like true ignored as speech',
    brain: 'phone',
    session_id: 'stress-phone-006',
    steps: [
      { input: { phone_lookup_found: true } },
      { input: { latest_customer_input: 'true' } },
    ],
    expect: {
      next_action: 'ASK_BIRTHDAY',
      safety_flag: 'latest_customer_input_looks_like_function_result',
      stored_birthday: null,
      never_function: 'check_birthday',
    },
  },
  {
    id: 22,
    group: 'PHONE',
    name: 'unrelated Anliegen after birthday ask',
    brain: 'phone',
    session_id: 'stress-phone-007',
    steps: [
      { input: { phone_lookup_found: true } },
      { input: { latest_customer_input: 'Ich möchte wissen wann meine Box kommt' } },
    ],
    expect: { next_action: 'ASK_BIRTHDAY', stored_birthday: null, never_function: 'check_birthday', transition_name: null },
  },
  {
    id: 23,
    group: 'VNR',
    name: 'digits-only VNR asks leading letter',
    brain: 'vnr',
    session_id: 'stress-vnr-001',
    steps: [{ input: { latest_customer_input: '039359923' } }],
    expect: { next_action: 'ASK_VNR_LETTER', never_function: 'check_insurance_number_format' },
  },
  {
    id: 24,
    group: 'VNR',
    name: 'letter then digits does not malformed lookup',
    brain: 'vnr',
    session_id: 'stress-vnr-002',
    steps: [
      { input: { latest_customer_input: 'L' } },
      { input: { latest_customer_input: '039359923' } },
    ],
    expect: {
      custom: (r) =>
        r.function_to_call === 'get_customer_by_insurance_number'
          ? 'lookup called on partial VNR'
          : ['ASK_VNR', 'ASK_VNR_LETTER', 'CONFIRM_VNR'].includes(r.next_action)
            ? null
            : `unexpected next_action ${r.next_action}`,
    },
  },
  {
    id: 25,
    group: 'VNR',
    name: 'spoken VNR then nein blocks format check',
    brain: 'vnr',
    session_id: 'stress-vnr-003',
    steps: [
      { input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } },
      { input: { latest_customer_input: 'nein' } },
    ],
    expect: { next_action: 'CONFIRM_VNR', never_function: 'check_insurance_number_format', stored_vnr: 'L039359923' },
  },
  {
    id: 26,
    group: 'VNR',
    name: 'spoken VNR confirm ja calls customer lookup',
    brain: 'vnr',
    session_id: 'stress-vnr-004',
    steps: [
      { input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } },
      { input: { latest_customer_input: 'ja' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_insurance_number',
      function_arguments: { insurance_number: 'L039359923' },
    },
  },
  {
    id: 27,
    group: 'VNR',
    name: 'invalid confirmed shape asks letter not lookup',
    brain: 'vnr',
    session_id: 'stress-vnr-005',
    steps: [
      { input: { vnr_candidate: '039359923', vnr_confirmed: true } },
    ],
    expect: { next_action: 'ASK_VNR_LETTER', never_function: 'get_customer_by_insurance_number' },
  },
  {
    id: 28,
    group: 'VNR',
    name: 'format Valid! allows lookup',
    brain: 'vnr',
    session_id: 'stress-vnr-006',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'get_customer_by_insurance_number' },
  },
  {
    id: 29,
    group: 'VNR',
    name: 'lookup not_found object retries VNR no birthday',
    brain: 'vnr',
    session_id: 'stress-vnr-007',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true } },
      { input: { get_customer_by_insurance_number_result: { error: 'Kein Kunde gefunden' } } },
    ],
    expect: { next_action: 'ASK_VNR', never_function: 'check_birthday' },
  },
  {
    id: 30,
    group: 'VNR',
    name: 'lookup found missing-year birthday then year',
    brain: 'vnr',
    session_id: 'stress-vnr-008',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid', get_customer_by_insurance_number_result: 'found' } },
      { input: { latest_customer_input: '16. März' } },
      { input: { latest_customer_input: 'neunzehnhundertsechsundfünfzig', birthday_system_available: true } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'check_birthday',
      custom: (_r, history) => {
        const early = history.find((h) => h.function_to_call === 'check_birthday' && h.next_action === 'ASK_BIRTH_YEAR');
        return early ? null : history.some((h) => h.function_to_call === 'check_birthday') ? null : 'never reached check_birthday';
      },
    },
  },
  {
    id: 31,
    group: 'VNR',
    name: 'wrong birthday then correct retries check',
    brain: 'vnr',
    session_id: 'stress-vnr-009',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid', get_customer_by_insurance_number_result: 'found', birthday_customer: '1956-03-16', birthday_system_available: true } },
      { input: { check_birthday_result: 'failed', birthday_check_attempts: 1 } },
      { input: { latest_customer_input: '16.03.1956', birthday_system_available: true } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'check_birthday', min_attempts: { birthday_check_attempts: 1 } },
  },
  {
    id: 32,
    group: 'VNR',
    name: 'birthday before lookup blocked',
    brain: 'vnr',
    session_id: 'stress-vnr-010',
    steps: [{ input: { latest_customer_input: '16.03.1956' } }],
    expect: { next_action: 'ASK_VNR', never_function: 'check_birthday' },
  },
  {
    id: 33,
    group: 'VNR',
    name: 'extra digits reject format check',
    brain: 'vnr',
    session_id: 'stress-vnr-011',
    steps: [{ input: { latest_customer_input: 'L03935992399' } }],
    expect: { next_action: 'ASK_VNR', never_function: 'check_insurance_number_format' },
  },
  {
    id: 34,
    group: 'VNR',
    name: 'missing first letter asks letter',
    brain: 'vnr',
    session_id: 'stress-vnr-012',
    steps: [{ input: { latest_customer_input: '039359923' } }],
    expect: { next_action: 'ASK_VNR_LETTER', never_function: 'check_insurance_number_format' },
  },
  {
    id: 35,
    group: 'CROSS',
    name: 'address fail twice VNR reuses reliable birthday',
    brain: 'address',
    session_id: 'stress-cross-001',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found', address_lookup_attempts: 2 } },
      { brain: 'vnr', input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid', get_customer_by_insurance_number_result: 'found', birthday_system_available: true } },
      { brain: 'vnr', input: {} },
    ],
    expect: {
      custom: (r, history) => {
        const fallback = history[0];
        if (fallback.next_action !== 'FALLBACK_TO_VNR') return 'address did not fallback to VNR';
        if (r.next_action !== 'CALL_CHECK_BIRTHDAY') return `expected VNR check_birthday reuse, got ${r.next_action}`;
        if (r.stored_values?.birthday_customer !== '1956-03-16') return 'birthday not reused from address session';
        if (r.function_arguments?.birthday !== '1956-03-16') return 'check_birthday args not normalized';
        return null;
      },
    },
  },
  {
    id: 36,
    group: 'CROSS',
    name: 'address fail once voluntary VNR switch',
    brain: 'address',
    session_id: 'stress-cross-002',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found' } },
      { brain: 'vnr', input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } },
    ],
    expect: {
      custom: (r) => {
        if (r.active_brain !== 'vnr') return 'VNR brain not active';
        if (r.stored_values?.plz !== '41372') return 'address PLZ lost during VNR switch';
        if (r.next_action !== 'CONFIRM_VNR') return `expected CONFIRM_VNR, got ${r.next_action}`;
        return null;
      },
    },
  },
  {
    id: 37,
    group: 'CROSS',
    name: 'address session wrong phone brain call',
    brain: 'address',
    session_id: 'stress-cross-003',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '100' } },
      { brain: 'phone', input: { phone_lookup_found: true, birthday_customer: '1956-03-16', birthday_system_available: true } },
    ],
    expect: {
      custom: (r) => {
        if (r.next_action === 'WRONG_METHOD') return null;
        if (r.next_action === 'CALL_CHECK_BIRTHDAY' && r.function_arguments?.birthday === '1956-03-16') return null;
        if (r.next_action === 'ASK_BIRTHDAY') return null;
        return `expected WRONG_METHOD or safe phone birthday handoff, got ${r.next_action}`;
      },
    },
  },
  {
    id: 38,
    group: 'CROSS',
    name: 'check_birthday_result on address brain ignored',
    brain: 'address',
    session_id: 'stress-cross-004',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', check_birthday_result: 'success' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      custom: (r) => (r.transition_name === 'weiter' ? 'address transitioned weiter from check_birthday_result' : null),
    },
  },
  {
    id: 39,
    group: 'CROSS',
    name: 'format result on address brain ignored',
    brain: 'address',
    session_id: 'stress-cross-005',
    steps: [
      { input: { plz: '41372', check_insurance_number_format_result: 'valid' } },
    ],
    expect: {
      next_action: 'ASK_HOUSE_NUMBER',
      stored_plz: '41372',
      custom: (r) =>
        r.stored_values?.check_insurance_number_format_result === 'valid'
          ? 'address stored VNR format result'
          : null,
    },
  },
  {
    id: 40,
    group: 'CROSS',
    name: 'concurrent address sessions isolated',
    brain: 'address',
    steps: [],
    expect: {
      custom: () => {
        const aId = 'stress-session-A';
        const bId = 'stress-session-B';
        runVerificationAddressBrain({ session_id: aId, latest_customer_input: '41372' });
        runVerificationAddressBrain({ session_id: bId, latest_customer_input: '22765' });
        runVerificationAddressBrain({ session_id: aId, latest_customer_input: '100' });
        runVerificationAddressBrain({ session_id: bId, latest_customer_input: '14' });
        const a = runVerificationAddressBrain({ session_id: aId, latest_customer_input: '16.03.1956' });
        const b = runVerificationAddressBrain({ session_id: bId, latest_customer_input: '01.05.1948' });
        if (a.function_arguments?.plz !== '41372' || a.function_arguments?.hnr !== '100') {
          return `session A lookup args corrupted: ${JSON.stringify(a.function_arguments)}`;
        }
        if (b.function_arguments?.plz !== '22765' || b.function_arguments?.hnr !== '14') {
          return `session B lookup args corrupted: ${JSON.stringify(b.function_arguments)}`;
        }
        if (a.function_arguments?.plz === b.function_arguments?.plz) return 'sessions merged PLZ values';
        return null;
      },
    },
  },
];

test('verification brain stress scenarios (40 hard sequences)', () => {
  const reports = STRESS_SCENARIOS.map(runStressScenario);
  const failed = reports.filter((r) => r.status === 'FAIL');
  const suspicious = reports.flatMap((r) => r.suspicious.map((s) => `#${r.id} ${r.name}: ${s}`));

  const lines: string[] = [];
  lines.push('\n=== VERIFICATION BRAIN STRESS REPORT ===\n');
  lines.push('| ID | Group | Scenario | Status | action_type | next_action | function_name |');
  lines.push('|---:|---|---|---|---|---|---|');
  for (const r of reports) {
    lines.push(
      `| ${r.id} | ${r.group} | ${r.name} | ${r.status} | ${r.final.action_type ?? '-'} | ${r.final.next_action} | ${r.final.function_name ?? '-'} |`
    );
  }
  if (failed.length) {
    lines.push('\nFailures:');
    for (const f of failed) {
      lines.push(`- #${f.id} ${f.name}: ${f.failures.join('; ')}`);
    }
  }
  if (suspicious.length) {
    lines.push('\nSuspicious:');
    for (const s of suspicious) lines.push(`- ${s}`);
  }
  console.log(lines.join('\n'));

  assert.equal(failed.length, 0, `${failed.length} stress scenario(s) failed:\n${failed.map((f) => `#${f.id} ${f.name}: ${f.failures.join('; ')}`).join('\n')}`);
});

export { runStressScenario, STRESS_SCENARIOS };

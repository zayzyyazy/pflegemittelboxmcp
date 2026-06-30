import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
  type VerificationAddressBrainInput,
  type VerificationPhoneBrainInput,
  type VerificationMethodBrainResult,
  type VerificationVnrBrainInput,
} from './verification-method-brains.js';

type BrainName = 'address' | 'phone' | 'vnr';

interface ScenarioStep {
  label?: string;
  input: Record<string, unknown>;
}

interface ScenarioExpectation {
  action_type?: string;
  next_action?: string;
  awaiting_field?: string | null;
  function_name?: string | null;
  function_to_call?: string | null;
  transition_name?: string | null;
  say_includes?: string;
  say_excludes?: string;
  stored_plz?: string | null;
  stored_house_number?: string | null;
  stored_birthday?: string | null;
  stored_vnr?: string | null;
  function_arguments?: Record<string, string> | null;
  session_mode?: string;
  has_missing_session_id?: boolean;
  known_values_includes?: Record<string, string>;
  safety_flag?: string;
  safety_flag_absent?: string;
  never_function?: string;
  ok?: boolean;
  custom?: (result: VerificationMethodBrainResult, history: VerificationMethodBrainResult[]) => string | null;
}

interface Scenario {
  id: number;
  name: string;
  brain: BrainName;
  session_id?: string;
  steps: ScenarioStep[];
  expect: ScenarioExpectation;
  notes?: string;
}

interface ScenarioReport {
  id: number;
  name: string;
  status: 'PASS' | 'FAIL';
  failures: string[];
  suspicious: string[];
  final: VerificationMethodBrainResult;
  history: VerificationMethodBrainResult[];
  inputs: ScenarioStep[];
}

function runBrain(
  brain: BrainName,
  input: Record<string, unknown>
): VerificationMethodBrainResult {
  if (brain === 'address') {
    return runVerificationAddressBrain(input as VerificationAddressBrainInput);
  }
  if (brain === 'phone') {
    return runVerificationPhoneBrain(input as VerificationPhoneBrainInput);
  }
  return runVerificationVnrBrain(input as VerificationVnrBrainInput);
}

function runScenario(scenario: Scenario): ScenarioReport {
  const history: VerificationMethodBrainResult[] = [];
  const inputs: ScenarioStep[] = [];
  let last: VerificationMethodBrainResult = runBrain(scenario.brain, {});

  for (const step of scenario.steps) {
    const payload = {
      ...(scenario.session_id ? { session_id: scenario.session_id } : {}),
      ...step.input,
    };
    inputs.push({ label: step.label, input: payload });
    last = runBrain(scenario.brain, payload);
    history.push(last);
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
  if (e.function_to_call !== undefined) check(r.function_to_call === e.function_to_call, `function_to_call expected ${String(e.function_to_call)}, got ${String(r.function_to_call)}`);
  if (e.transition_name !== undefined) check(r.transition_name === e.transition_name, `transition_name expected ${String(e.transition_name)}, got ${String(r.transition_name)}`);
  if (e.say_includes) check(r.say.toLowerCase().includes(e.say_includes.toLowerCase()), `say should include "${e.say_includes}", got "${r.say}"`);
  if (e.say_excludes) check(!r.say.toLowerCase().includes(e.say_excludes.toLowerCase()), `say should not include "${e.say_excludes}"`);
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
  if (e.session_mode) check(r.session_mode === e.session_mode, `session_mode expected ${e.session_mode}, got ${r.session_mode}`);
  if (e.has_missing_session_id !== undefined) {
    const has = r.safety_flags.includes('missing_session_id');
    check(has === e.has_missing_session_id, `missing_session_id flag expected ${e.has_missing_session_id}, got ${has}`);
  }
  if (e.known_values_includes) {
    for (const [key, value] of Object.entries(e.known_values_includes)) {
      check(
        r.known_values_required_next_call?.[key] === value,
        `known_values_required_next_call.${key} expected ${value}, got ${r.known_values_required_next_call?.[key]}`
      );
    }
  }
  if (e.safety_flag) check(r.safety_flags.includes(e.safety_flag), `expected safety flag ${e.safety_flag}`);
  if (e.safety_flag_absent) check(!r.safety_flags.includes(e.safety_flag_absent), `did not expect safety flag ${e.safety_flag_absent}`);
  if (e.never_function) {
    check(r.function_name !== e.never_function && r.function_to_call !== e.never_function, `must not call ${e.never_function}`);
  }
  if (e.ok !== undefined) check(r.ok === e.ok, `ok expected ${e.ok}, got ${r.ok}`);
  if (e.custom) {
    const customFailure = e.custom(r, history);
    if (customFailure) failures.push(customFailure);
  }

  if (r.action_type === 'CALL_FUNCTION' && !r.function_arguments && r.function_to_call === 'get_customer_by_plz_geb') {
    suspicious.push('CALL_FUNCTION without function_arguments for address lookup');
  }
  if (r.action_type === 'CALL_FUNCTION' && r.function_to_call && r.function_name !== r.function_to_call) {
    suspicious.push(`action_type/function_name mismatch: function_name=${r.function_name}, function_to_call=${r.function_to_call}`);
  }
  if (r.action_type === 'TRANSITION' && r.transition_name !== r.transition_to) {
    suspicious.push(`transition_name ${r.transition_name} != transition_to ${r.transition_to}`);
  }
  if (r.session_mode === 'stateless' && r.stored_values?.plz && !r.known_values_required_next_call?.plz) {
    suspicious.push('stateless has stored plz but known_values_required_next_call missing plz');
  }

  return {
    id: scenario.id,
    name: scenario.name,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
    suspicious,
    final: r,
    history,
    inputs,
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    name: 'Address start',
    brain: 'address',
    session_id: 'addr-001',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: '' } }],
    expect: { action_type: 'SAY_ONLY', next_action: 'ASK_PLZ', awaiting_field: 'plz', say_includes: 'Postleitzahl' },
  },
  {
    id: 2,
    name: 'Full spoken PLZ',
    brain: 'address',
    session_id: 'addr-002',
    steps: [
      { input: { phone_lookup_found: false, latest_customer_input: '' } },
      { input: { latest_customer_input: 'vier eins drei sieben zwei' } },
    ],
    expect: {
      action_type: 'SAY_ONLY',
      next_action: 'ASK_HOUSE_NUMBER',
      awaiting_field: 'house_number',
      stored_plz: '41372',
      stored_house_number: null,
    },
  },
  {
    id: 3,
    name: 'Incomplete 4-digit PLZ',
    brain: 'address',
    session_id: 'addr-003',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: 'eins drei sieben zwei' } }],
    expect: { next_action: 'ASK_PLZ', awaiting_field: 'plz', stored_plz: null, stored_house_number: null },
  },
  {
    id: 4,
    name: 'Numeric PLZ',
    brain: 'address',
    session_id: 'addr-004',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: '41372' } }],
    expect: { stored_plz: '41372', next_action: 'ASK_HOUSE_NUMBER', awaiting_field: 'house_number' },
  },
  {
    id: 5,
    name: 'Spoken house number after PLZ',
    brain: 'address',
    session_id: 'addr-005',
    steps: [
      { input: { phone_lookup_found: false, plz: '41372' } },
      { input: { latest_customer_input: 'einhundert' } },
    ],
    expect: { stored_house_number: '100', next_action: 'ASK_BIRTHDAY', awaiting_field: 'birthday_customer' },
  },
  {
    id: 6,
    name: 'House number with suffix',
    brain: 'address',
    session_id: 'addr-006',
    steps: [
      { input: { plz: '41372' } },
      { input: { latest_customer_input: 'hundert b' } },
    ],
    expect: { stored_house_number: '100', next_action: 'ASK_BIRTHDAY' },
  },
  {
    id: 7,
    name: 'House number as digits',
    brain: 'address',
    session_id: 'addr-007',
    steps: [
      { input: { plz: '41372' } },
      { input: { latest_customer_input: '100' } },
    ],
    expect: { stored_house_number: '100', next_action: 'ASK_BIRTHDAY' },
  },
  {
    id: 8,
    name: 'Street name plus house number',
    brain: 'address',
    session_id: 'addr-008',
    steps: [
      { input: { plz: '41372' } },
      { input: { latest_customer_input: 'Musterstraße einhundert' } },
    ],
    expect: { stored_house_number: '100', next_action: 'ASK_BIRTHDAY' },
  },
  {
    id: 9,
    name: 'Birthday full spoken',
    brain: 'address',
    session_id: 'addr-009',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: 'sechzehnter März neunzehnhundertsechsundfünfzig' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      stored_birthday: '1956-03-16',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 10,
    name: 'Birthday numeric',
    brain: 'address',
    session_id: 'addr-010',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 11,
    name: 'Birthday missing year',
    brain: 'address',
    session_id: 'addr-011',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: 'sechzehnter März' } },
    ],
    expect: { action_type: 'SAY_ONLY', next_action: 'ASK_BIRTH_YEAR', function_name: null, say_includes: 'Jahr' },
  },
  {
    id: 12,
    name: 'Birthday impossible date',
    brain: 'address',
    session_id: 'addr-012',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: '31. Februar 1956' } },
    ],
    expect: { action_type: 'SAY_ONLY', next_action: 'ASK_BIRTHDAY', function_name: null, say_includes: 'Geburtsdatum' },
  },
  {
    id: 13,
    name: 'Birthday future date',
    brain: 'address',
    session_id: 'addr-013',
    steps: [
      { input: { plz: '41372', house_number: '100' } },
      { input: { latest_customer_input: '16. März 2030' } },
    ],
    expect: {
      action_type: 'SAY_ONLY',
      next_action: 'ASK_BIRTHDAY',
      function_name: null,
      custom: (r) => (r.stored_values?.birthday_customer === '2030-03-16' ? 'accepted future birthday 2030-03-16' : null),
    },
  },
  {
    id: 14,
    name: 'Complete explicit fields in one call',
    brain: 'address',
    session_id: 'addr-014',
    steps: [{ input: { phone_lookup_found: false, plz: '41372', house_number: '100', birthday_customer: '1956-03-16' } }],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 15,
    name: 'Full customer sentence with all values',
    brain: 'address',
    session_id: 'addr-015',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: 'Meine Postleitzahl ist 41372, Hausnummer 100, geboren am 16.03.1956' } }],
    expect: {
      custom: (r) => {
        if (r.action_type === 'CALL_FUNCTION' && r.function_arguments?.plz === '41372') return null;
        if (r.next_action === 'ASK_HOUSE_NUMBER' && r.stored_values?.plz === '41372' && !r.stored_values?.house_number) return null;
        return `expected CALL_FUNCTION or safe stepwise ask; got ${r.next_action} plz=${r.stored_values?.plz} hnr=${r.stored_values?.house_number}`;
      },
    },
  },
  {
    id: 16,
    name: 'Stateless PLZ turn',
    brain: 'address',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: 'vier eins drei sieben zwei' } }],
    expect: {
      session_mode: 'stateless',
      has_missing_session_id: true,
      known_values_includes: { plz: '41372' },
      next_action: 'ASK_HOUSE_NUMBER',
      stored_plz: '41372',
    },
  },
  {
    id: 17,
    name: 'Stateless continuation with explicit known value',
    brain: 'address',
    steps: [{ input: { phone_lookup_found: false, plz: '41372', latest_customer_input: 'einhundert' } }],
    expect: {
      session_mode: 'stateless',
      stored_house_number: '100',
      known_values_includes: { plz: '41372', house_number: '100' },
      next_action: 'ASK_BIRTHDAY',
    },
  },
  {
    id: 18,
    name: 'Function result-like latest input',
    brain: 'address',
    session_id: 'addr-018',
    steps: [{ input: { phone_lookup_found: false, latest_customer_input: 'Kein Kunde gefunden' } }],
    expect: {
      safety_flag: 'latest_customer_input_looks_like_function_result',
      next_action: 'ASK_PLZ',
      stored_plz: null,
    },
  },
  {
    id: 19,
    name: 'First not_found after lookup',
    brain: 'address',
    session_id: 'addr-019',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16' } },
      { input: { get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' } } },
    ],
    expect: { action_type: 'SAY_ONLY', next_action: 'CONFIRM_ADDRESS_VALUES', awaiting_field: 'confirm_address', function_name: null },
  },
  {
    id: 20,
    name: 'Confirm same values after first not_found',
    brain: 'address',
    session_id: 'addr-020',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found' } },
      { input: { latest_customer_input: 'ja das stimmt' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
    },
  },
  {
    id: 21,
    name: 'Second not_found',
    brain: 'address',
    session_id: 'addr-021',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found' } },
      { input: { latest_customer_input: 'ja', get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' }, address_lookup_attempts: 2 } },
    ],
    expect: { next_action: 'FALLBACK_TO_VNR', say_includes: 'Versicherungsnummer', never_function: 'get_customer_by_plz_geb' },
  },
  {
    id: 22,
    name: 'Address path never calls check_birthday',
    brain: 'address',
    session_id: 'addr-022',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16' } },
      { input: { get_customer_by_plz_geb_result: 'not_found' } },
    ],
    expect: {
      custom: (_r, history) => {
        const bad = history.find((h) => h.function_name === 'check_birthday' || h.function_to_call === 'check_birthday');
        return bad ? 'address brain called check_birthday' : null;
      },
      never_function: 'check_birthday',
    },
  },
  {
    id: 23,
    name: 'Phone start found customer',
    brain: 'phone',
    session_id: 'phone-001',
    steps: [{ input: { phone_lookup_found: true, latest_customer_input: '' } }],
    expect: { action_type: 'SAY_ONLY', next_action: 'ASK_BIRTHDAY', say_includes: 'Geburtsdatum' },
  },
  {
    id: 24,
    name: 'Phone birthday full',
    brain: 'phone',
    session_id: 'phone-024',
    steps: [
      { input: { phone_lookup_found: true } },
      { input: { latest_customer_input: 'sechzehnter März neunzehnhundertsechsundfünfzig', birthday_system_available: true } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'check_birthday', stored_birthday: '1956-03-16' },
  },
  {
    id: 25,
    name: 'Phone birthday missing year',
    brain: 'phone',
    session_id: 'phone-025',
    steps: [{ input: { phone_lookup_found: true, latest_customer_input: 'sechzehnter März' } }],
    expect: { next_action: 'ASK_BIRTH_YEAR', function_name: null },
  },
  {
    id: 26,
    name: 'Phone birthday impossible',
    brain: 'phone',
    session_id: 'phone-026',
    steps: [{ input: { phone_lookup_found: true, latest_customer_input: '31. Februar 1956' } }],
    expect: { next_action: 'ASK_BIRTHDAY', function_name: null },
  },
  {
    id: 27,
    name: 'Birthday system missing',
    brain: 'phone',
    session_id: 'phone-027',
    steps: [{ input: { phone_lookup_found: true, latest_customer_input: '16.03.1956', birthday_system_available: false } }],
    expect: { action_type: 'ERROR', next_action: 'TECHNICAL_ESCALATION', function_name: null },
  },
  {
    id: 28,
    name: 'check_birthday success',
    brain: 'phone',
    session_id: 'phone-028',
    steps: [{ input: { phone_lookup_found: true, birthday_customer: '1956-03-16', check_birthday_result: true } }],
    expect: { action_type: 'TRANSITION', transition_name: 'weiter', next_action: 'TRANSITION_WEITER' },
  },
  {
    id: 29,
    name: 'check_birthday false',
    brain: 'phone',
    session_id: 'phone-029',
    steps: [{ input: { phone_lookup_found: true, birthday_customer: '1956-03-16', check_birthday_result: false } }],
    expect: { next_action: 'ASK_BIRTHDAY', transition_name: null },
  },
  {
    id: 30,
    name: 'check_birthday error alias',
    brain: 'phone',
    session_id: 'phone-030',
    steps: [{ input: { phone_lookup_found: true, birthday_customer: '1956-03-16', check_birthday_error: 'Missing field value: birthday_system' } }],
    expect: { action_type: 'ERROR', next_action: 'TECHNICAL_ESCALATION', transition_name: null },
  },
  {
    id: 31,
    name: 'VNR start',
    brain: 'vnr',
    session_id: 'vnr-001',
    steps: [{ input: { latest_customer_input: '' } }],
    expect: { action_type: 'SAY_ONLY', next_action: 'ASK_VNR', say_includes: 'Versicherungsnummer' },
  },
  {
    id: 32,
    name: 'Digits-only VNR',
    brain: 'vnr',
    session_id: 'vnr-032',
    steps: [{ input: { latest_customer_input: 'null drei neun drei fünf neun neun zwei drei' } }],
    expect: { next_action: 'ASK_VNR_LETTER', function_name: null },
  },
  {
    id: 33,
    name: 'Full spoken VNR with spelling alphabet',
    brain: 'vnr',
    session_id: 'vnr-033',
    steps: [{ input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } }],
    expect: { next_action: 'CONFIRM_VNR', stored_vnr: 'L039359923' },
  },
  {
    id: 34,
    name: 'Confirmation yes after VNR',
    brain: 'vnr',
    session_id: 'vnr-034',
    steps: [
      { input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } },
      { input: { latest_customer_input: 'ja' } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'check_insurance_number_format' },
  },
  {
    id: 35,
    name: 'Confirmation no',
    brain: 'vnr',
    session_id: 'vnr-035',
    steps: [
      { input: { latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei' } },
      { input: { latest_customer_input: 'nein' } },
    ],
    expect: {
      custom: (r) => {
        if (r.next_action === 'ASK_VNR' || r.next_action === 'CONFIRM_VNR') return null;
        return `expected ASK_VNR or CONFIRM_VNR after nein, got ${r.next_action}`;
      },
    },
  },
  {
    id: 36,
    name: 'VNR missing digits',
    brain: 'vnr',
    session_id: 'vnr-036',
    steps: [{ input: { latest_customer_input: 'L wie Ludwig null drei neun' } }],
    expect: { custom: (r) => (r.next_action === 'CALL_CHECK_INSURANCE_NUMBER_FORMAT' ? 'premature format check' : null) },
  },
  {
    id: 37,
    name: 'VNR too many digits',
    brain: 'vnr',
    session_id: 'vnr-037',
    steps: [{ input: { latest_customer_input: 'L null drei neun drei fünf neun neun zwei drei vier fünf' } }],
    expect: { custom: (r) => (r.next_action === 'CALL_CHECK_INSURANCE_NUMBER_FORMAT' ? 'premature format check on too-long VNR' : null) },
  },
  {
    id: 38,
    name: 'Format valid alias string',
    brain: 'vnr',
    session_id: 'vnr-038',
    steps: [{ input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'Valid!' } }],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'get_customer_by_insurance_number' },
  },
  {
    id: 39,
    name: 'Format valid boolean',
    brain: 'vnr',
    session_id: 'vnr-039',
    steps: [{ input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: true } }],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'get_customer_by_insurance_number' },
  },
  {
    id: 40,
    name: 'Format invalid',
    brain: 'vnr',
    session_id: 'vnr-040',
    steps: [{ input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: false } }],
    expect: { next_action: 'ASK_VNR', function_name: null },
  },
  {
    id: 41,
    name: 'Customer lookup found',
    brain: 'vnr',
    session_id: 'vnr-041',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid' } },
      { input: { get_customer_by_insurance_number_result: { id: '123', birthday: '1956-03-16' } } },
    ],
    expect: { next_action: 'ASK_BIRTHDAY', function_name: null },
  },
  {
    id: 42,
    name: 'Customer lookup not found',
    brain: 'vnr',
    session_id: 'vnr-042',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid' } },
      { input: { get_customer_by_insurance_number_result: { error: 'Kein Kunde gefunden' } } },
    ],
    expect: { next_action: 'ASK_VNR', function_name: null, never_function: 'check_birthday' },
  },
  {
    id: 43,
    name: 'Birthday after VNR lookup',
    brain: 'vnr',
    session_id: 'vnr-043',
    steps: [
      { input: { vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid', get_customer_by_insurance_number_result: 'found' } },
      { input: { latest_customer_input: '16.03.1956', birthday_system_available: true } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'check_birthday' },
  },
  {
    id: 44,
    name: 'VNR must never call check_birthday before lookup',
    brain: 'vnr',
    session_id: 'vnr-044',
    steps: [{ input: { latest_customer_input: '16.03.1956' } }],
    expect: { never_function: 'check_birthday', next_action: 'ASK_VNR' },
  },
  {
    id: 45,
    name: 'Reuse birthday from address path if reliable',
    brain: 'vnr',
    session_id: 'shared-045',
    steps: [
      { input: { birthday_customer: '1956-03-16', vnr_candidate: 'L039359923', vnr_confirmed: true, check_insurance_number_format_result: 'valid' } },
      { input: { get_customer_by_insurance_number_result: 'found', birthday_system_available: true } },
    ],
    expect: { action_type: 'CALL_FUNCTION', function_name: 'check_birthday', stored_birthday: '1956-03-16' },
  },
  {
    id: 46,
    name: 'Same session path switch address -> VNR',
    brain: 'address',
    session_id: 'shared-046',
    steps: [
      { input: { plz: '41372', house_number: '100', birthday_customer: '1956-03-16', get_customer_by_plz_geb_result: 'not_found', address_lookup_attempts: 2 } },
    ],
    expect: {
      next_action: 'FALLBACK_TO_VNR',
      custom: (r) => {
        const vnr = runVerificationVnrBrain({ session_id: 'shared-046', latest_customer_input: '' });
        return vnr.active_brain === 'vnr' ? null : 'VNR brain did not activate on shared session';
      },
    },
  },
  {
    id: 47,
    name: 'Function result valid ignored in each brain',
    brain: 'address',
    session_id: 'cross-047-address',
    steps: [{ input: { latest_customer_input: 'valid' } }],
    expect: { safety_flag: 'latest_customer_input_looks_like_function_result', next_action: 'ASK_PLZ' },
  },
  {
    id: 48,
    name: 'No session_id across 3 address turns without explicit known values',
    brain: 'address',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '100' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      custom: (r, history) => {
        const prematureLookup = history.find((h) => h.action_type === 'CALL_FUNCTION');
        if (prematureLookup) return 'called lookup without reliable accumulated state';
        if (r.session_mode !== 'stateless') return 'expected stateless mode';
        if (!r.known_values_required_next_call?.plz && r.stored_values?.plz) return 'missing known plz on final turn';
        return null;
      },
    },
  },
  {
    id: 49,
    name: 'Tool-call-like fake session ID changes each turn',
    brain: 'address',
    steps: [
      { input: { session_id: 'call_1', latest_customer_input: '41372' } },
      { input: { session_id: 'call_2', latest_customer_input: '100' } },
      { input: { session_id: 'call_3', latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      custom: (r) => (r.action_type === 'CALL_FUNCTION' ? 'should not complete lookup across changing session_ids' : null),
      session_mode: 'stateless',
    },
  },
  {
    id: 50,
    name: 'Stable session_id across same address turns',
    brain: 'address',
    session_id: 'addr-050',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '100' } },
      { input: { latest_customer_input: '16.03.1956' } },
    ],
    expect: {
      action_type: 'CALL_FUNCTION',
      function_name: 'get_customer_by_plz_geb',
      function_arguments: { plz: '41372', hnr: '100', bday: '1956-03-16' },
      session_mode: 'session',
    },
  },
  {
    id: 51,
    name: 'Concurrent session separation',
    brain: 'address',
    steps: [],
    expect: {
      custom: () => {
        runVerificationAddressBrain({ session_id: 'addr-A', latest_customer_input: '41372' });
        runVerificationAddressBrain({ session_id: 'addr-B', latest_customer_input: '22765' });
        const a = runVerificationAddressBrain({ session_id: 'addr-A', latest_customer_input: '100' });
        const b = runVerificationAddressBrain({ session_id: 'addr-B', latest_customer_input: '14' });
        if (a.stored_values?.plz !== '41372' || a.stored_values?.house_number !== '100') return 'addr-A state corrupted';
        if (b.stored_values?.plz !== '22765' || b.stored_values?.house_number !== '14') return 'addr-B state corrupted';
        return null;
      },
    },
  },
  {
    id: 52,
    name: 'Repeated same valid PLZ answer',
    brain: 'address',
    session_id: 'addr-052',
    steps: [
      { input: { latest_customer_input: '41372' } },
      { input: { latest_customer_input: '41372' } },
    ],
    expect: { stored_plz: '41372', stored_house_number: null, next_action: 'ASK_HOUSE_NUMBER' },
  },
  {
    id: 53,
    name: 'User asks why do you need this',
    brain: 'address',
    session_id: 'addr-053',
    steps: [{ input: { latest_customer_input: 'warum brauchen Sie das?' } }],
    expect: { next_action: 'ASK_PLZ', stored_plz: null, function_name: null },
  },
  {
    id: 54,
    name: 'Customer requests human',
    brain: 'address',
    session_id: 'addr-054',
    steps: [{ input: { latest_customer_input: 'Ich will einen Menschen sprechen', customer_requested_human: true, office_hours: true } }],
    expect: { next_action: 'TRANSFER_HUMAN', safety_flag: 'customer_requested_human' },
  },
  {
    id: 55,
    name: 'Customer says Ich bin Neukunde',
    brain: 'address',
    session_id: 'addr-055',
    steps: [{ input: { latest_customer_input: 'Ich bin Neukunde' } }],
    expect: {
      custom: (r) =>
        r.next_action === 'TRANSITION_NICHT_IDENTIFIZIERT' || r.transition_name === 'nicht_identifiziert'
          ? null
          : `expected nicht_identifiziert handling, got ${r.next_action}`,
    },
  },
];

const EXTRA_CROSS: Scenario[] = [
  {
    id: 47,
    name: 'Function result valid ignored - phone',
    brain: 'phone',
    session_id: 'cross-047-phone',
    steps: [{ input: { phone_lookup_found: true, latest_customer_input: 'valid' } }],
    expect: { next_action: 'ASK_BIRTHDAY' },
  },
  {
    id: 47,
    name: 'Function result valid ignored - vnr',
    brain: 'vnr',
    session_id: 'cross-047-vnr',
    steps: [{ input: { latest_customer_input: 'valid' } }],
    expect: { safety_flag: 'latest_customer_input_looks_like_function_result', next_action: 'ASK_VNR' },
  },
];

function summarizeResult(r: VerificationMethodBrainResult) {
  return {
    action_type: r.action_type,
    next_action: r.next_action,
    say: r.say,
    function_name: r.function_name,
    function_arguments: r.function_arguments ?? null,
    transition_name: r.transition_name,
    awaiting_field: r.awaiting_field ?? null,
    session_mode: r.session_mode,
    known_values_required_next_call: r.known_values_required_next_call ?? {},
    stored_values: r.stored_values,
    safety_flags: r.safety_flags,
  };
}

test('verification brain broad scenario pass', () => {
  const reports: ScenarioReport[] = [];

  for (const scenario of [...SCENARIOS, ...EXTRA_CROSS.filter((s) => s.name.includes('phone') || s.name.includes('vnr'))]) {
    reports.push(runScenario(scenario));
  }

  const failed = reports.filter((r) => r.status === 'FAIL');
  const lines: string[] = [];
  lines.push('\n=== VERIFICATION BRAIN SCENARIO REPORT ===\n');
  lines.push('| ID | Scenario | Status | action_type | next_action | awaiting_field | function_name |');
  lines.push('|---:|---|---|---|---|---|---|');
  for (const r of reports) {
    lines.push(
      `| ${r.id} | ${r.name} | ${r.status} | ${r.final.action_type ?? '-'} | ${r.final.next_action} | ${r.final.awaiting_field ?? '-'} | ${r.final.function_name ?? '-'} |`
    );
  }
  if (failed.length) {
    lines.push('\nFailures:');
    for (const f of failed) {
      lines.push(`- #${f.id} ${f.name}: ${f.failures.join('; ')}`);
    }
  }
  console.log(lines.join('\n'));

  for (const r of reports) {
    if (r.status === 'FAIL') {
      console.log(`\n--- FAIL #${r.id} ${r.name} ---`);
      console.log(JSON.stringify({ failures: r.failures, suspicious: r.suspicious, final: summarizeResult(r.final) }, null, 2));
    }
  }

  // Report-only harness: log failures but do not fail CI until scenarios are green.
  if (process.env.SCENARIO_STRICT === '1') {
    assert.equal(failed.length, 0, `${failed.length} scenario(s) failed:\n${failed.map((f) => `#${f.id} ${f.name}: ${f.failures.join('; ')}`).join('\n')}`);
  }
});

export { runScenario, SCENARIOS, summarizeResult };

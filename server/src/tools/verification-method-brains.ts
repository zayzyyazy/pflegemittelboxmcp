export interface VerificationPhoneBrainInput {
  phone_lookup_found?: boolean;
  birthday_customer?: string;
  check_birthday_result?: 'success' | 'failed' | 'error' | 'not_called';
  check_birthday_error?: string;
  birthday_system_available?: boolean;
  birthday_request_count?: number;
  birthday_check_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationAddressBrainInput {
  phone_lookup_found?: boolean;
  plz?: string;
  house_number?: string;
  birthday_customer?: string;
  get_customer_by_plz_geb_result?: 'found' | 'not_found' | 'error' | 'not_called';
  address_lookup_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationVnrBrainInput {
  vnr_raw?: string;
  vnr_candidate?: string;
  vnr_confirmed?: boolean;
  check_insurance_number_format_result?: 'valid' | 'invalid' | 'error' | 'not_called';
  get_customer_by_insurance_number_result?: 'found' | 'not_found' | 'error' | 'not_called';
  birthday_customer?: string;
  check_birthday_result?: 'success' | 'failed' | 'error' | 'not_called';
  check_birthday_error?: string;
  birthday_system_available?: boolean;
  vnr_request_count?: number;
  vnr_lookup_attempts?: number;
  birthday_request_count?: number;
  birthday_check_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationMethodBrainResult {
  ok: boolean;
  method: 'phone' | 'address' | 'vnr';
  next_action: string;
  allowed_to_call_function: boolean;
  function_to_call: string | null;
  allowed_to_transition: boolean;
  transition_to: 'weiter' | 'nicht_identifiziert' | null;
  say: string;
  reason: string;
  missing_fields: string[];
  safety_flags: string[];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeVnr(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return compact || undefined;
}

function isMissingBirthdaySystem(error: string | undefined): boolean {
  return (error ?? '').includes('Missing field value: birthday_system');
}

function makeResult(
  method: 'phone' | 'address' | 'vnr',
  patch: Omit<VerificationMethodBrainResult, 'method' | 'allowed_to_call_function' | 'function_to_call' | 'allowed_to_transition' | 'transition_to'> & {
    function_to_call?: string | null;
    transition_to?: 'weiter' | 'nicht_identifiziert' | null;
  }
): VerificationMethodBrainResult {
  const function_to_call = patch.function_to_call ?? null;
  const transition_to = patch.transition_to ?? null;
  return {
    ok: patch.ok,
    method,
    next_action: patch.next_action,
    allowed_to_call_function: Boolean(function_to_call),
    function_to_call,
    allowed_to_transition: transition_to !== null,
    transition_to,
    say: patch.say,
    reason: patch.reason,
    missing_fields: patch.missing_fields,
    safety_flags: patch.safety_flags,
  };
}

function maybeTransferHuman(method: 'phone' | 'address' | 'vnr', requested?: boolean, officeHours?: boolean) {
  if (!requested || officeHours !== true) return null;
  return makeResult(method, {
    ok: true,
    next_action: 'TRANSFER_HUMAN',
    say: 'Ich verbinde Sie jetzt mit einer zuständigen Person weiter.',
    reason: 'Customer requested a human during office hours.',
    missing_fields: [],
    safety_flags: ['customer_requested_human'],
  });
}

export function coerceVerificationPhoneBrainInput(input: Record<string, unknown>): VerificationPhoneBrainInput {
  return {
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result:
      input.check_birthday_result === 'success' ||
      input.check_birthday_result === 'failed' ||
      input.check_birthday_result === 'error' ||
      input.check_birthday_result === 'not_called'
        ? input.check_birthday_result
        : undefined,
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available: asBoolean(input.birthday_system_available),
    birthday_request_count: asNumber(input.birthday_request_count),
    birthday_check_attempts: asNumber(input.birthday_check_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function coerceVerificationAddressBrainInput(input: Record<string, unknown>): VerificationAddressBrainInput {
  return {
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    plz: asString(input.plz),
    house_number: asString(input.house_number),
    birthday_customer: asString(input.birthday_customer),
    get_customer_by_plz_geb_result:
      input.get_customer_by_plz_geb_result === 'found' ||
      input.get_customer_by_plz_geb_result === 'not_found' ||
      input.get_customer_by_plz_geb_result === 'error' ||
      input.get_customer_by_plz_geb_result === 'not_called'
        ? input.get_customer_by_plz_geb_result
        : undefined,
    address_lookup_attempts: asNumber(input.address_lookup_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function coerceVerificationVnrBrainInput(input: Record<string, unknown>): VerificationVnrBrainInput {
  return {
    vnr_raw: normalizeVnr(asString(input.vnr_raw)),
    vnr_candidate: normalizeVnr(asString(input.vnr_candidate)),
    vnr_confirmed: asBoolean(input.vnr_confirmed),
    check_insurance_number_format_result:
      input.check_insurance_number_format_result === 'valid' ||
      input.check_insurance_number_format_result === 'invalid' ||
      input.check_insurance_number_format_result === 'error' ||
      input.check_insurance_number_format_result === 'not_called'
        ? input.check_insurance_number_format_result
        : undefined,
    get_customer_by_insurance_number_result:
      input.get_customer_by_insurance_number_result === 'found' ||
      input.get_customer_by_insurance_number_result === 'not_found' ||
      input.get_customer_by_insurance_number_result === 'error' ||
      input.get_customer_by_insurance_number_result === 'not_called'
        ? input.get_customer_by_insurance_number_result
        : undefined,
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result:
      input.check_birthday_result === 'success' ||
      input.check_birthday_result === 'failed' ||
      input.check_birthday_result === 'error' ||
      input.check_birthday_result === 'not_called'
        ? input.check_birthday_result
        : undefined,
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available: asBoolean(input.birthday_system_available),
    vnr_request_count: asNumber(input.vnr_request_count),
    vnr_lookup_attempts: asNumber(input.vnr_lookup_attempts),
    birthday_request_count: asNumber(input.birthday_request_count),
    birthday_check_attempts: asNumber(input.birthday_check_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function runVerificationPhoneBrain(rawInput: VerificationPhoneBrainInput): VerificationMethodBrainResult {
  const input: VerificationPhoneBrainInput = {
    ...rawInput,
    check_birthday_result: rawInput.check_birthday_result ?? 'not_called',
    birthday_request_count: rawInput.birthday_request_count ?? 0,
    birthday_check_attempts: rawInput.birthday_check_attempts ?? 0,
  };

  const transfer = maybeTransferHuman('phone', input.customer_requested_human, input.office_hours);
  if (transfer) return transfer;

  if (input.phone_lookup_found !== true) {
    return makeResult('phone', {
      ok: false,
      next_action: 'WRONG_METHOD',
      say: '',
      reason: 'Phone verification brain can only be used after get_customer_by_phone found a customer.',
      missing_fields: [],
      safety_flags: ['wrong_method_phone_lookup_not_found'],
    });
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    });
  }

  if (!input.birthday_customer) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('phone', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Customer was found by phone but birthday has not been provided yet.',
      missing_fields: ['birthday_customer'],
      safety_flags: [],
    });
  }

  if (input.check_birthday_result === 'success') {
    return makeResult('phone', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after phone lookup.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    });
  }

  if (input.check_birthday_result === 'failed') {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      return makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('phone', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal zur Verifizierung.',
      reason: 'Birthday check failed once and one retry is still allowed.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_retry'],
    });
  }

  if (input.birthday_system_available === false) {
    return makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    });
  }

  return makeResult('phone', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Birthday is available and it is safe to call check_birthday.',
    missing_fields: [],
    safety_flags: [],
    function_to_call: 'check_birthday',
  });
}

export function runVerificationAddressBrain(rawInput: VerificationAddressBrainInput): VerificationMethodBrainResult {
  const input: VerificationAddressBrainInput = {
    ...rawInput,
    get_customer_by_plz_geb_result: rawInput.get_customer_by_plz_geb_result ?? 'not_called',
    address_lookup_attempts: rawInput.address_lookup_attempts ?? 0,
  };

  const transfer = maybeTransferHuman('address', input.customer_requested_human, input.office_hours);
  if (transfer) return transfer;

  if (!input.plz) {
    return makeResult('address', {
      ok: true,
      next_action: 'ASK_PLZ',
      say: 'Bitte nennen Sie mir Ihre Postleitzahl.',
      reason: 'PLZ is required before the address lookup can run.',
      missing_fields: ['plz'],
      safety_flags: [],
    });
  }

  if (!input.house_number) {
    return makeResult('address', {
      ok: true,
      next_action: 'ASK_HOUSE_NUMBER',
      say: 'Bitte nennen Sie mir Ihre Hausnummer.',
      reason: 'House number is required before the address lookup can run.',
      missing_fields: ['house_number'],
      safety_flags: [],
    });
  }

  if (!input.birthday_customer) {
    return makeResult('address', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Birthday is required together with PLZ and house number for the address lookup.',
      missing_fields: ['birthday_customer'],
      safety_flags: [],
    });
  }

  if (input.get_customer_by_plz_geb_result === 'found') {
    return makeResult('address', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Address lookup found the customer using PLZ, house number, and birthday.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    });
  }

  if (input.get_customer_by_plz_geb_result === 'not_found') {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return makeResult('address', {
        ok: false,
        next_action: 'FALLBACK_TO_VNR',
        say: 'Ich konnte Sie über diese Angaben nicht eindeutig finden. Bitte nennen Sie mir stattdessen Ihre Versicherungsnummer.',
        reason: 'Address lookup failed twice, so the next safe fallback is VNR verification.',
        missing_fields: [],
        safety_flags: ['fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
      });
    }

    return makeResult('address', {
      ok: true,
      next_action: 'CONFIRM_ADDRESS_VALUES',
      say: 'Ich konnte Sie damit noch nicht finden. Bitte bestätigen Sie Postleitzahl, Hausnummer und Geburtsdatum noch einmal.',
      reason: 'Address lookup failed once and one confirmation retry is still allowed.',
      missing_fields: [],
      safety_flags: ['address_retry', 'never_call_check_birthday_in_address_path'],
    });
  }

  if (input.get_customer_by_plz_geb_result === 'error') {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return makeResult('address', {
        ok: false,
        next_action: 'FALLBACK_TO_VNR',
        say: 'Ich wechsle zur Verifizierung über Ihre Versicherungsnummer.',
        reason: 'Address lookup produced repeated errors, so the safe fallback is VNR verification.',
        missing_fields: [],
        safety_flags: ['address_lookup_error', 'fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
      });
    }

    return makeResult('address', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Address lookup returned an error before a safe retry decision could be made.',
      missing_fields: [],
      safety_flags: ['address_lookup_error', 'never_call_check_birthday_in_address_path'],
    });
  }

  return makeResult('address', {
    ok: true,
    next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
    say: '',
    reason: 'PLZ, house number, and birthday are complete.',
    missing_fields: [],
    safety_flags: ['never_call_check_birthday_in_address_path'],
    function_to_call: 'get_customer_by_plz_geb',
  });
}

export function runVerificationVnrBrain(rawInput: VerificationVnrBrainInput): VerificationMethodBrainResult {
  const input: VerificationVnrBrainInput = {
    ...rawInput,
    vnr_raw: normalizeVnr(rawInput.vnr_raw),
    vnr_candidate: normalizeVnr(rawInput.vnr_candidate ?? rawInput.vnr_raw),
    check_insurance_number_format_result: rawInput.check_insurance_number_format_result ?? 'not_called',
    get_customer_by_insurance_number_result:
      rawInput.get_customer_by_insurance_number_result ?? 'not_called',
    check_birthday_result: rawInput.check_birthday_result ?? 'not_called',
    vnr_request_count: rawInput.vnr_request_count ?? 0,
    vnr_lookup_attempts: rawInput.vnr_lookup_attempts ?? 0,
    birthday_request_count: rawInput.birthday_request_count ?? 0,
    birthday_check_attempts: rawInput.birthday_check_attempts ?? 0,
  };

  const transfer = maybeTransferHuman('vnr', input.customer_requested_human, input.office_hours);
  if (transfer) return transfer;

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    });
  }

  if (!input.vnr_candidate) {
    if ((input.vnr_request_count ?? 0) >= 2) {
      return makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'VNR was not provided after the allowed number of requests.',
        missing_fields: ['vnr'],
        safety_flags: ['vnr_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versicherungsnummer.',
      reason: 'VNR is required to continue the VNR verification path.',
      missing_fields: ['vnr'],
      safety_flags: [],
    });
  }

  if (input.vnr_confirmed !== true) {
    return makeResult('vnr', {
      ok: true,
      next_action: 'CONFIRM_VNR',
      say: `Ich habe ${input.vnr_candidate} verstanden. Ist das korrekt?`,
      reason: 'VNR must be confirmed before format validation or lookup.',
      missing_fields: [],
      safety_flags: [],
    });
  }

  if (input.check_insurance_number_format_result === 'not_called') {
    return makeResult('vnr', {
      ok: true,
      next_action: 'CALL_CHECK_INSURANCE_NUMBER_FORMAT',
      say: '',
      reason: 'Confirmed VNR must be format-checked before any customer lookup.',
      missing_fields: [],
      safety_flags: [],
      function_to_call: 'check_insurance_number_format',
    });
  }

  if (input.check_insurance_number_format_result === 'invalid') {
    if ((input.vnr_request_count ?? 0) >= 2) {
      return makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte die Versicherungsnummer leider nicht eindeutig verarbeiten.',
        reason: 'VNR format was invalid after the allowed retry limit.',
        missing_fields: ['vnr'],
        safety_flags: ['vnr_format_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versicherungsnummer noch einmal.',
      reason: 'VNR format is invalid and one more request is allowed.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_format_retry'],
    });
  }

  if (input.check_insurance_number_format_result === 'error') {
    return makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'VNR format check returned an error.',
      missing_fields: [],
      safety_flags: ['vnr_format_error'],
    });
  }

  if (input.get_customer_by_insurance_number_result === 'not_called') {
    return makeResult('vnr', {
      ok: false,
      next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER',
      say: '',
      reason:
        'VNR format is valid, but customer lookup has not been called yet. Birthday check is not allowed before customer lookup.',
      missing_fields: [],
      safety_flags: ['blocked_check_birthday_before_customer_lookup'],
      function_to_call: 'get_customer_by_insurance_number',
    });
  }

  if (input.get_customer_by_insurance_number_result === 'not_found') {
    if ((input.vnr_lookup_attempts ?? 0) >= 2) {
      return makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'Customer lookup by insurance number failed twice.',
        missing_fields: [],
        safety_flags: ['vnr_lookup_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Ich konnte Sie damit noch nicht finden. Bitte nennen Sie mir Ihre Versicherungsnummer noch einmal.',
      reason: 'Customer lookup by insurance number failed once and one retry is still allowed.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_lookup_retry'],
    });
  }

  if (input.get_customer_by_insurance_number_result === 'error') {
    return makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Customer lookup by insurance number returned an error.',
      missing_fields: [],
      safety_flags: ['vnr_lookup_error'],
    });
  }

  if (!input.birthday_customer) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Customer lookup by insurance number found a customer, so birthday is the next safe verification step.',
      missing_fields: ['birthday_customer'],
      safety_flags: [],
    });
  }

  if (input.check_birthday_result === 'success') {
    return makeResult('vnr', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after the customer was found by insurance number.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    });
  }

  if (input.check_birthday_result === 'failed') {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      return makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      });
    }

    return makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal zur Verifizierung.',
      reason: 'Birthday check failed once and one retry is still allowed.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_retry'],
    });
  }

  if (input.birthday_system_available === false) {
    return makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    });
  }

  return makeResult('vnr', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Customer lookup found a customer and birthday is available, so check_birthday is the next safe step.',
    missing_fields: [],
    safety_flags: [],
    function_to_call: 'check_birthday',
  });
}

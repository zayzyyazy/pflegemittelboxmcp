export interface VerificationBrainInput {
  phone_lookup_found?: boolean;
  identified?: boolean;
  authenticated?: boolean;
  lookup_path?: 'phone' | 'address' | 'vnr' | 'unknown';
  plz?: string;
  house_number?: string;
  birthday_customer?: string;
  vnr_raw?: string;
  vnr_confirmed?: boolean;
  vnr_candidate?: string;
  vnr_valid_shape?: boolean;
  get_customer_by_plz_geb_result?: 'found' | 'not_found' | 'error' | 'not_called';
  get_customer_by_insurance_number_result?: 'found' | 'not_found' | 'error' | 'not_called';
  check_birthday_result?: 'success' | 'failed' | 'error' | 'not_called';
  check_birthday_error?: string;
  birthday_system_available?: boolean;
  attempt_counts?: {
    birthday_requests?: number;
    address_lookup_attempts?: number;
    vnr_lookup_attempts?: number;
    birthday_check_attempts?: number;
  };
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationBrainResult {
  ok: boolean;
  next_action:
    | 'ASK_BIRTHDAY'
    | 'ASK_PLZ'
    | 'ASK_HOUSE_NUMBER'
    | 'ASK_VNR'
    | 'CONFIRM_VNR'
    | 'CALL_GET_CUSTOMER_BY_PLZ_GEB'
    | 'CALL_CHECK_INSURANCE_NUMBER_FORMAT'
    | 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER'
    | 'CALL_CHECK_BIRTHDAY'
    | 'TRANSITION_WEITER'
    | 'TRANSITION_NICHT_IDENTIFIZIERT'
    | 'TRANSFER_HUMAN'
    | 'TECHNICAL_ESCALATION'
    | 'WAIT';
  allowed_to_call_function: boolean;
  function_to_call?: string | null;
  allowed_to_transition: boolean;
  transition_to?: 'weiter' | 'nicht_identifiziert' | null;
  say: string;
  reason: string;
  missing_fields: string[];
  safety_flags: string[];
}

function parseJsonish<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
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

function makeResult(
  patch: Partial<VerificationBrainResult> & Pick<VerificationBrainResult, 'ok' | 'next_action' | 'say' | 'reason'>
): VerificationBrainResult {
  const transition =
    patch.next_action === 'TRANSITION_WEITER'
      ? 'weiter'
      : patch.next_action === 'TRANSITION_NICHT_IDENTIFIZIERT'
        ? 'nicht_identifiziert'
        : null;
  const functionMap: Partial<Record<VerificationBrainResult['next_action'], string>> = {
    CALL_GET_CUSTOMER_BY_PLZ_GEB: 'get_customer_by_plz_geb',
    CALL_CHECK_INSURANCE_NUMBER_FORMAT: 'check_insurance_number_format',
    CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER: 'get_customer_by_insurance_number',
    CALL_CHECK_BIRTHDAY: 'check_birthday',
  };

  return {
    ok: patch.ok,
    next_action: patch.next_action,
    allowed_to_call_function: Boolean(functionMap[patch.next_action]),
    function_to_call: functionMap[patch.next_action] ?? null,
    allowed_to_transition: transition !== null,
    transition_to: transition,
    say: patch.say,
    reason: patch.reason,
    missing_fields: patch.missing_fields ?? [],
    safety_flags: patch.safety_flags ?? [],
  };
}

function isMissingBirthdaySystem(error: string | undefined): boolean {
  return (error ?? '').includes('Missing field value: birthday_system');
}

function getAddressMissingFields(input: VerificationBrainInput): string[] {
  const missing: string[] = [];
  if (!input.plz) missing.push('plz');
  if (!input.house_number) missing.push('house_number');
  if (!input.birthday_customer) missing.push('birthday');
  return missing;
}

function hasConfirmedValidVnr(input: VerificationBrainInput): boolean {
  const candidate = normalizeVnr(input.vnr_candidate ?? input.vnr_raw);
  return Boolean(input.vnr_confirmed && input.vnr_valid_shape === true && candidate?.match(/^[A-Z]\d{9}$/));
}

export function coerceVerificationBrainInput(input: Record<string, unknown>): VerificationBrainInput {
  const parsedCounts = parseJsonish<Record<string, unknown>>(input.attempt_counts);
  return {
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    identified: asBoolean(input.identified),
    authenticated: asBoolean(input.authenticated),
    lookup_path:
      input.lookup_path === 'phone' ||
      input.lookup_path === 'address' ||
      input.lookup_path === 'vnr' ||
      input.lookup_path === 'unknown'
        ? input.lookup_path
        : undefined,
    plz: asString(input.plz),
    house_number: asString(input.house_number),
    birthday_customer: asString(input.birthday_customer),
    vnr_raw: normalizeVnr(asString(input.vnr_raw)),
    vnr_confirmed: asBoolean(input.vnr_confirmed),
    vnr_candidate: normalizeVnr(asString(input.vnr_candidate)),
    vnr_valid_shape: asBoolean(input.vnr_valid_shape),
    get_customer_by_plz_geb_result:
      input.get_customer_by_plz_geb_result === 'found' ||
      input.get_customer_by_plz_geb_result === 'not_found' ||
      input.get_customer_by_plz_geb_result === 'error' ||
      input.get_customer_by_plz_geb_result === 'not_called'
        ? input.get_customer_by_plz_geb_result
        : undefined,
    get_customer_by_insurance_number_result:
      input.get_customer_by_insurance_number_result === 'found' ||
      input.get_customer_by_insurance_number_result === 'not_found' ||
      input.get_customer_by_insurance_number_result === 'error' ||
      input.get_customer_by_insurance_number_result === 'not_called'
        ? input.get_customer_by_insurance_number_result
        : undefined,
    check_birthday_result:
      input.check_birthday_result === 'success' ||
      input.check_birthday_result === 'failed' ||
      input.check_birthday_result === 'error' ||
      input.check_birthday_result === 'not_called'
        ? input.check_birthday_result
        : undefined,
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available: asBoolean(input.birthday_system_available),
    attempt_counts: {
      birthday_requests: asNumber(input.attempt_counts && typeof input.attempt_counts === 'object'
        ? (input.attempt_counts as Record<string, unknown>).birthday_requests
        : parsedCounts?.birthday_requests),
      address_lookup_attempts: asNumber(input.attempt_counts && typeof input.attempt_counts === 'object'
        ? (input.attempt_counts as Record<string, unknown>).address_lookup_attempts
        : parsedCounts?.address_lookup_attempts),
      vnr_lookup_attempts: asNumber(input.attempt_counts && typeof input.attempt_counts === 'object'
        ? (input.attempt_counts as Record<string, unknown>).vnr_lookup_attempts
        : parsedCounts?.vnr_lookup_attempts),
      birthday_check_attempts: asNumber(input.attempt_counts && typeof input.attempt_counts === 'object'
        ? (input.attempt_counts as Record<string, unknown>).birthday_check_attempts
        : parsedCounts?.birthday_check_attempts),
    },
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function runVerificationBrain(rawInput: VerificationBrainInput): VerificationBrainResult {
  const input: VerificationBrainInput = {
    ...rawInput,
    attempt_counts: {
      birthday_requests: rawInput.attempt_counts?.birthday_requests ?? 0,
      address_lookup_attempts: rawInput.attempt_counts?.address_lookup_attempts ?? 0,
      vnr_lookup_attempts: rawInput.attempt_counts?.vnr_lookup_attempts ?? 0,
      birthday_check_attempts: rawInput.attempt_counts?.birthday_check_attempts ?? 0,
    },
    get_customer_by_plz_geb_result: rawInput.get_customer_by_plz_geb_result ?? 'not_called',
    get_customer_by_insurance_number_result:
      rawInput.get_customer_by_insurance_number_result ?? 'not_called',
    check_birthday_result: rawInput.check_birthday_result ?? 'not_called',
    lookup_path: rawInput.lookup_path ?? 'unknown',
    vnr_candidate: normalizeVnr(rawInput.vnr_candidate ?? rawInput.vnr_raw),
    vnr_raw: normalizeVnr(rawInput.vnr_raw),
  };

  if (input.customer_requested_human) {
    return makeResult({
      ok: true,
      next_action: 'TRANSFER_HUMAN',
      say:
        input.office_hours === false
          ? 'Ich gebe Ihr Anliegen jetzt zur menschlichen Bearbeitung weiter.'
          : 'Ich verbinde Sie jetzt mit einer zuständigen Person weiter.',
      reason: 'Customer explicitly requested a human handoff.',
      safety_flags: ['customer_requested_human'],
    });
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return makeResult({
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'check_birthday cannot run safely because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    });
  }

  if (input.identified && input.authenticated) {
    return makeResult({
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Customer is already identified and authenticated.',
    });
  }

  const birthdayCheckAttempts = input.attempt_counts?.birthday_check_attempts ?? 0;
  const addressAttempts = input.attempt_counts?.address_lookup_attempts ?? 0;
  const vnrAttempts = input.attempt_counts?.vnr_lookup_attempts ?? 0;

  const canRunBirthdayCheck = input.birthday_customer && input.birthday_system_available !== false;

  if (input.phone_lookup_found) {
    if (!input.birthday_customer) {
      return makeResult({
        ok: true,
        next_action: 'ASK_BIRTHDAY',
        say: 'Bitte nennen Sie mir Ihr Geburtsdatum.',
        reason: 'Phone lookup found a customer, so birthday is the required second factor.',
        missing_fields: ['birthday'],
      });
    }
    if (input.birthday_system_available === false) {
      return makeResult({
        ok: false,
        next_action: 'TECHNICAL_ESCALATION',
        say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
        reason: 'Birthday check is blocked because birthday_system is unavailable.',
        missing_fields: ['birthday_system'],
        safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
      });
    }
    if (input.check_birthday_result === 'success') {
      return makeResult({
        ok: true,
        next_action: 'TRANSITION_WEITER',
        say: 'Danke, die Verifizierung ist abgeschlossen.',
        reason: 'Birthday check succeeded on the phone lookup path.',
      });
    }
    if (input.check_birthday_result === 'failed' && birthdayCheckAttempts >= 2) {
      return makeResult({
        ok: true,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Die Verifizierung war leider nicht erfolgreich.',
        reason: 'Birthday check failed twice on the phone lookup path.',
        safety_flags: ['max_birthday_check_attempts'],
      });
    }
    if (input.check_birthday_result === 'failed') {
      return makeResult({
        ok: true,
        next_action: 'ASK_BIRTHDAY',
        say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal.',
        reason: 'Birthday check failed once on the phone lookup path.',
        missing_fields: ['birthday'],
      });
    }
    if (canRunBirthdayCheck) {
      return makeResult({
        ok: true,
        next_action: 'CALL_CHECK_BIRTHDAY',
        say: 'Einen Moment bitte.',
        reason: 'Phone lookup found a customer and birthday is ready for verification.',
      });
    }
  }

  const addressMissing = getAddressMissingFields(input);
  const shouldUseVnrPath =
    input.lookup_path === 'vnr' ||
    addressAttempts >= 2 ||
    input.get_customer_by_plz_geb_result === 'not_found';

  if (!shouldUseVnrPath) {
    if (input.get_customer_by_plz_geb_result === 'found') {
      return makeResult({
        ok: true,
        next_action: 'TRANSITION_WEITER',
        say: 'Danke, die Verifizierung ist abgeschlossen.',
        reason: 'Address lookup found the customer and already included birthday verification.',
      });
    }
    if (input.get_customer_by_plz_geb_result === 'error') {
      return makeResult({
        ok: false,
        next_action: 'TECHNICAL_ESCALATION',
        say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
        reason: 'Address lookup returned an error.',
        safety_flags: ['address_lookup_error'],
      });
    }
    if (addressMissing.length > 0) {
      const first = addressMissing[0];
      return makeResult({
        ok: true,
        next_action:
          first === 'plz' ? 'ASK_PLZ' : first === 'house_number' ? 'ASK_HOUSE_NUMBER' : 'ASK_BIRTHDAY',
        say:
          first === 'plz'
            ? 'Bitte nennen Sie mir Ihre Postleitzahl.'
            : first === 'house_number'
              ? 'Bitte nennen Sie mir noch Ihre Hausnummer.'
              : 'Bitte nennen Sie mir Ihr Geburtsdatum.',
        reason:
          first === 'plz'
            ? 'Address lookup path starts with the customer PLZ.'
            : first === 'house_number'
              ? 'PLZ and birthday are known, house number is missing.'
              : 'PLZ and house number are known, birthday is missing.',
        missing_fields: addressMissing,
      });
    }
    if (addressAttempts >= 2) {
      return makeResult({
        ok: true,
        next_action: 'ASK_VNR',
        say: 'Bitte nennen Sie mir stattdessen Ihre Versichertennummer.',
        reason: 'Address lookup was attempted twice without a safe match.',
        safety_flags: ['max_address_lookup_attempts'],
      });
    }
    return makeResult({
      ok: true,
      next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
      say: 'Einen Moment bitte.',
      reason: 'PLZ, house number, and birthday are complete for address lookup.',
    });
  }

  if (addressAttempts >= 2 && !input.vnr_candidate && !input.vnr_raw) {
    return makeResult({
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir jetzt Ihre Versichertennummer.',
      reason: 'Address lookup failed twice, so the flow falls back to VNR.',
      safety_flags: ['fallback_to_vnr'],
    });
  }

  if (input.get_customer_by_insurance_number_result === 'error') {
    return makeResult({
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'VNR lookup returned an error.',
      safety_flags: ['vnr_lookup_error'],
    });
  }

  if (input.get_customer_by_insurance_number_result === 'found') {
    if (!input.birthday_customer) {
      return makeResult({
        ok: true,
        next_action: 'ASK_BIRTHDAY',
        say: 'Bitte nennen Sie mir Ihr Geburtsdatum.',
        reason: 'Birthday is required after a successful VNR lookup.',
        missing_fields: ['birthday'],
      });
    }
    if (input.birthday_system_available === false) {
      return makeResult({
        ok: false,
        next_action: 'TECHNICAL_ESCALATION',
        say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
        reason: 'Birthday check is blocked because birthday_system is unavailable.',
        missing_fields: ['birthday_system'],
        safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
      });
    }
    if (input.check_birthday_result === 'success') {
      return makeResult({
        ok: true,
        next_action: 'TRANSITION_WEITER',
        say: 'Danke, die Verifizierung ist abgeschlossen.',
        reason: 'Birthday check succeeded after VNR lookup.',
      });
    }
    if (input.check_birthday_result === 'failed' && birthdayCheckAttempts >= 2) {
      return makeResult({
        ok: true,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Die Verifizierung war leider nicht erfolgreich.',
        reason: 'Birthday check failed twice after VNR lookup.',
        safety_flags: ['max_birthday_check_attempts'],
      });
    }
    if (input.check_birthday_result === 'failed') {
      return makeResult({
        ok: true,
        next_action: 'ASK_BIRTHDAY',
        say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal.',
        reason: 'Birthday check failed once after VNR lookup.',
        missing_fields: ['birthday'],
      });
    }
    return makeResult({
      ok: true,
      next_action: 'CALL_CHECK_BIRTHDAY',
      say: 'Einen Moment bitte.',
      reason: 'Birthday is ready for the required birthday check after VNR lookup.',
    });
  }

  if (input.get_customer_by_insurance_number_result === 'not_found' && vnrAttempts >= 2) {
    return makeResult({
      ok: true,
      next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
      say: 'Die Verifizierung war leider nicht erfolgreich.',
      reason: 'VNR lookup failed twice.',
      safety_flags: ['max_vnr_lookup_attempts'],
    });
  }

  if (!input.vnr_candidate && !input.vnr_raw) {
    return makeResult({
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versichertennummer.',
      reason: 'VNR is required after the address path was exhausted.',
      missing_fields: ['vnr'],
    });
  }

  if (!input.vnr_confirmed) {
    return makeResult({
      ok: true,
      next_action: 'CONFIRM_VNR',
      say: 'Bitte bestätigen Sie mir die Versichertennummer noch einmal.',
      reason: 'VNR exists but is not yet confirmed.',
    });
  }

  if (input.vnr_valid_shape !== true) {
    if (input.vnr_valid_shape === false) {
      return makeResult({
        ok: true,
        next_action: 'ASK_VNR',
        say: 'Die Versichertennummer passt so noch nicht. Bitte nennen Sie sie mir noch einmal.',
        reason: 'Confirmed VNR does not have the required shape.',
        missing_fields: ['vnr'],
        safety_flags: ['invalid_vnr_shape'],
      });
    }
    return makeResult({
      ok: true,
      next_action: 'CALL_CHECK_INSURANCE_NUMBER_FORMAT',
      say: 'Einen Moment bitte.',
      reason: 'Confirmed VNR needs a format check before lookup.',
    });
  }

  if (hasConfirmedValidVnr(input)) {
    return makeResult({
      ok: true,
      next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER',
      say: 'Einen Moment bitte.',
      reason: 'Confirmed VNR is ready for customer lookup.',
    });
  }

  return makeResult({
    ok: true,
    next_action: 'WAIT',
    say: 'Einen Moment bitte.',
    reason: 'No safe next step could be derived yet.',
    safety_flags: ['no_safe_action'],
  });
}

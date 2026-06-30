export interface PostCallAlertDetectorInput {
  call_id?: string;
  duration_seconds?: number;
  call_status?: 'completed' | 'failed' | 'transferred' | 'dropped' | 'unknown';
  authenticated?: boolean;
  verification_successful?: boolean;
  transcript_text?: string;
  function_calls?: Array<{
    name: string;
    arguments?: unknown;
    result?: unknown;
    error?: string;
    timestamp?: string;
  }>;
  transitions?: Array<{
    from?: string;
    to?: string;
    timestamp?: string;
  }>;
  detected_events?: {
    customer_frustrated?: boolean;
    customer_requested_human?: boolean;
    technical_issue_mentioned?: boolean;
    repeated_birthday_requests?: number;
    repeated_vnr_requests?: number;
    repeated_address_requests?: number;
    silence_or_dead_air?: boolean;
  };
}

export interface PostCallAlertDetectorResult {
  ok: boolean;
  alert_required: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  alert_type:
    | 'NONE'
    | 'LONG_FAILED_VERIFICATION'
    | 'CUSTOMER_FRUSTRATED'
    | 'TECHNICAL_ERROR'
    | 'MISSING_BIRTHDAY_SYSTEM'
    | 'REPEATED_AUTHENTICATION'
    | 'DROPPED_OR_FAILED_CALL'
    | 'TRANSFER_REQUEST_NOT_HANDLED'
    | 'UNKNOWN_FAILURE';
  title: string;
  summary: string;
  evidence: string[];
  recommended_next_step: string;
  safety_flags: string[];
}

const LONG_CALL_ALERT_THRESHOLD_SECONDS = 180;

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

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function makeAlert(
  alert: Omit<PostCallAlertDetectorResult, 'ok'>
): PostCallAlertDetectorResult {
  return { ok: true, ...alert };
}

export function coercePostCallAlertDetectorInput(
  input: Record<string, unknown>
): PostCallAlertDetectorInput {
  const parsedFunctionCalls = parseJsonish<PostCallAlertDetectorInput['function_calls']>(
    input.function_calls
  );
  const parsedTransitions = parseJsonish<PostCallAlertDetectorInput['transitions']>(
    input.transitions
  );
  const parsedDetectedEvents = parseJsonish<Record<string, unknown>>(input.detected_events);

  return {
    call_id: asString(input.call_id),
    duration_seconds: asNumber(input.duration_seconds),
    call_status:
      input.call_status === 'completed' ||
      input.call_status === 'failed' ||
      input.call_status === 'transferred' ||
      input.call_status === 'dropped' ||
      input.call_status === 'unknown'
        ? input.call_status
        : undefined,
    authenticated: asBoolean(input.authenticated),
    verification_successful: asBoolean(input.verification_successful),
    transcript_text: asString(input.transcript_text),
    function_calls: Array.isArray(input.function_calls)
      ? (input.function_calls as PostCallAlertDetectorInput['function_calls'])
      : parsedFunctionCalls,
    transitions: Array.isArray(input.transitions)
      ? (input.transitions as PostCallAlertDetectorInput['transitions'])
      : parsedTransitions,
    detected_events: {
      customer_frustrated: asBoolean(
        parsedDetectedEvents?.customer_frustrated ??
          (input.detected_events as Record<string, unknown> | undefined)?.customer_frustrated
      ),
      customer_requested_human: asBoolean(
        parsedDetectedEvents?.customer_requested_human ??
          (input.detected_events as Record<string, unknown> | undefined)?.customer_requested_human
      ),
      technical_issue_mentioned: asBoolean(
        parsedDetectedEvents?.technical_issue_mentioned ??
          (input.detected_events as Record<string, unknown> | undefined)?.technical_issue_mentioned
      ),
      repeated_birthday_requests: asNumber(
        parsedDetectedEvents?.repeated_birthday_requests ??
          (input.detected_events as Record<string, unknown> | undefined)
            ?.repeated_birthday_requests
      ),
      repeated_vnr_requests: asNumber(
        parsedDetectedEvents?.repeated_vnr_requests ??
          (input.detected_events as Record<string, unknown> | undefined)?.repeated_vnr_requests
      ),
      repeated_address_requests: asNumber(
        parsedDetectedEvents?.repeated_address_requests ??
          (input.detected_events as Record<string, unknown> | undefined)
            ?.repeated_address_requests
      ),
      silence_or_dead_air: asBoolean(
        parsedDetectedEvents?.silence_or_dead_air ??
          (input.detected_events as Record<string, unknown> | undefined)?.silence_or_dead_air
      ),
    },
  };
}

function transcriptSuggestsFrustration(transcript: string | undefined): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  return (
    lower.includes('beschwer') ||
    lower.includes('frustriert') ||
    lower.includes('mensch') ||
    lower.includes('unzufrieden')
  );
}

function transferHappened(input: PostCallAlertDetectorInput): boolean {
  if (input.call_status === 'transferred') return true;
  return (
    input.transitions?.some((transition) =>
      `${transition.from ?? ''} ${transition.to ?? ''}`.toLowerCase().includes('transfer')
    ) ?? false
  );
}

export function runPostCallAlertDetector(
  input: PostCallAlertDetectorInput
): PostCallAlertDetectorResult {
  const functionErrors = (input.function_calls ?? [])
    .map((call) => call.error)
    .filter((error): error is string => typeof error === 'string' && error.length > 0);

  const birthdaySystemError = functionErrors.find((error) =>
    error.includes('Missing field value: birthday_system')
  );
  if (birthdaySystemError) {
    return makeAlert({
      alert_required: true,
      severity: 'critical',
      alert_type: 'MISSING_BIRTHDAY_SYSTEM',
      title: 'Birthday verification failed because birthday_system was missing',
      summary:
        'check_birthday could not compare the customer birthday because the stored birthday field was missing.',
      evidence: [`check_birthday error: ${birthdaySystemError}`],
      recommended_next_step:
        'Send call ID to Marc/Leaping and check whether the lookup path populated birthday_system.',
      safety_flags: ['missing_birthday_system', 'verification_blocker'],
    });
  }

  const repeatedBirthday = input.detected_events?.repeated_birthday_requests ?? 0;
  const repeatedVnr = input.detected_events?.repeated_vnr_requests ?? 0;
  const repeatedAddress = input.detected_events?.repeated_address_requests ?? 0;
  if (repeatedBirthday > 2 || repeatedVnr > 2 || repeatedAddress > 2) {
    const evidence: string[] = [];
    if (repeatedBirthday > 2) evidence.push(`repeated_birthday_requests=${repeatedBirthday}`);
    if (repeatedVnr > 2) evidence.push(`repeated_vnr_requests=${repeatedVnr}`);
    if (repeatedAddress > 2) evidence.push(`repeated_address_requests=${repeatedAddress}`);
    return makeAlert({
      alert_required: true,
      severity: 'high',
      alert_type: 'REPEATED_AUTHENTICATION',
      title: 'Repeated authentication loop detected',
      summary:
        'The call shows repeated birthday, address, or VNR requests beyond the allowed retry window.',
      evidence,
      recommended_next_step:
        'Review the verification flow and check whether the caller got stuck in a retry loop.',
      safety_flags: ['repeated_authentication'],
    });
  }

  if (input.detected_events?.customer_requested_human && !transferHappened(input)) {
    return makeAlert({
      alert_required: true,
      severity: 'high',
      alert_type: 'TRANSFER_REQUEST_NOT_HANDLED',
      title: 'Customer requested a human but no transfer was detected',
      summary: 'The caller asked for human help and the call record does not show a transfer.',
      evidence: ['customer_requested_human=true', 'no transfer transition found'],
      recommended_next_step: 'Review whether the transfer path failed or the request was missed.',
      safety_flags: ['missed_human_handoff'],
    });
  }

  if (input.call_status === 'failed' || input.call_status === 'dropped') {
    return makeAlert({
      alert_required: true,
      severity: 'high',
      alert_type: 'DROPPED_OR_FAILED_CALL',
      title: 'Call failed before a clean completion',
      summary: 'The call ended with a failed or dropped status.',
      evidence: [`call_status=${input.call_status}`],
      recommended_next_step: 'Inspect the call record and confirm whether the customer needs a callback.',
      safety_flags: ['dropped_or_failed_call'],
    });
  }

  const frustrationDetected =
    input.detected_events?.customer_frustrated === true ||
    (input.detected_events?.customer_frustrated === undefined &&
      transcriptSuggestsFrustration(input.transcript_text));
  if (frustrationDetected) {
    return makeAlert({
      alert_required: true,
      severity: 'medium',
      alert_type: 'CUSTOMER_FRUSTRATED',
      title: 'Customer frustration detected',
      summary: 'The call contains signs that the customer was frustrated during the interaction.',
      evidence:
        input.detected_events?.customer_frustrated === true
          ? ['customer_frustrated=true']
          : ['transcript suggests frustration'],
      recommended_next_step: 'Review the call and check whether the flow caused avoidable friction.',
      safety_flags: ['customer_frustrated'],
    });
  }

  if (
    (input.duration_seconds ?? 0) >= LONG_CALL_ALERT_THRESHOLD_SECONDS &&
    input.verification_successful !== true
  ) {
    return makeAlert({
      alert_required: true,
      severity: 'high',
      alert_type: 'LONG_FAILED_VERIFICATION',
      title: 'Long call without successful verification',
      summary: 'Call lasted more than 3 minutes and verification was not successful.',
      evidence: [
        `duration_seconds=${input.duration_seconds}`,
        `verification_successful=${String(input.verification_successful ?? false)}`,
      ],
      recommended_next_step:
        'Review verification flow and check whether customer got stuck in birthday/address/VNR loop.',
      safety_flags: ['long_failed_verification'],
    });
  }

  if (functionErrors.length > 0 || input.detected_events?.technical_issue_mentioned) {
    return makeAlert({
      alert_required: true,
      severity: 'medium',
      alert_type: 'TECHNICAL_ERROR',
      title: 'Technical issue detected after the call',
      summary: 'The call record contains a technical issue that should be reviewed.',
      evidence: functionErrors.length > 0 ? functionErrors.slice(0, 3) : ['technical_issue_mentioned=true'],
      recommended_next_step: 'Review the failing function call or system error and decide whether follow-up is needed.',
      safety_flags: ['technical_issue_detected'],
    });
  }

  return makeAlert({
    alert_required: false,
    severity: 'none',
    alert_type: 'NONE',
    title: 'No post-call alert required',
    summary: 'No rule-based post-call issue was detected.',
    evidence: [],
    recommended_next_step: 'No action needed.',
    safety_flags: [],
  });
}

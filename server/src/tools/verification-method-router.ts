import { normalizeVnr as normalizeVnrLoose } from './normalize-vnr.js';
import {
  loadVerificationSessionState,
  storeVerificationSessionState,
  type VerificationSessionState,
} from './verification-method-brains.js';

export type VerificationPath = 'phone' | 'address' | 'vnr';

export interface VerificationMethodRouterInput {
  session_id?: string;
  latest_customer_input?: string;
  phone_lookup_found?: boolean;
  /** Optional intent label from Leaping (e.g. box_change, delivery_status). */
  customer_intent?: string;
}

export interface VerificationMethodRouterResult {
  ok: true;
  action_type: 'SAY_ONLY';
  say: string;
  active_brain: VerificationPath | null;
  next_brain:
    | 'pmb_verification_phone_brain'
    | 'pmb_verification_address_brain'
    | 'pmb_verification_vnr_brain'
    | null;
  requires_followup_mcp_call: boolean;
  session_id_received: boolean;
  session_mode: 'session' | 'stateless';
}

const METHOD_CHOICE_SUFFIX =
  'Ich kann Sie entweder über Ihre Versichertennummer oder über Ihre Postleitzahl identifizieren. Was ist Ihnen lieber?';

const NEXT_BRAIN: Record<
  VerificationPath,
  VerificationMethodRouterResult['next_brain'] & string
> = {
  phone: 'pmb_verification_phone_brain',
  address: 'pmb_verification_address_brain',
  vnr: 'pmb_verification_vnr_brain',
};

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function coerceVerificationMethodRouterInput(
  input: Record<string, unknown>
): VerificationMethodRouterInput {
  return {
    session_id: optionalString(input.session_id),
    latest_customer_input: optionalString(input.latest_customer_input),
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    customer_intent: optionalString(input.customer_intent),
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

export function buildMethodChoiceIntro(customerIntent?: string): string {
  const normalized = normalizeText(customerIntent ?? '');

  if (
    normalized.includes('boxwechsel') ||
    normalized.includes('box wechsel') ||
    normalized.includes('box aendern') ||
    normalized.includes('box ändern') ||
    normalized.includes('box change') ||
    normalized.includes('box_change') ||
    (normalized.includes('box') && (normalized.includes('aender') || normalized.includes('änder') || normalized.includes('wechsel')))
  ) {
    return 'Gerne, ich helfe Ihnen dabei, Ihre Box zu ändern. Dafür muss ich Sie kurz identifizieren.';
  }

  if (
    normalized.includes('lieferstatus') ||
    normalized.includes('delivery_status') ||
    normalized.includes('delivery status') ||
    normalized.includes('lieferung') ||
    normalized.includes('wo ist') ||
    normalized.includes('wohin') ||
    (normalized.includes('box') && (normalized.includes('ist') || normalized.includes('status')))
  ) {
    return 'Gerne, ich schaue nach, wo Ihre Box ist. Dafür muss ich Sie kurz identifizieren.';
  }

  return 'Gerne, ich helfe Ihnen dabei. Dafür muss ich Sie kurz identifizieren.';
}

export function buildMethodChoiceQuestion(customerIntent?: string): string {
  return `${buildMethodChoiceIntro(customerIntent)} ${METHOD_CHOICE_SUFFIX}`;
}

function looksLikeVnrCandidate(text: string): boolean {
  const compact = text.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z][0-9]{9}$/.test(compact);
}

function detectVnrPreference(text: string | undefined): boolean {
  if (!text) return false;
  if (looksLikeVnrCandidate(text)) return true;
  const normalized = normalizeText(text);
  const vnrKeywords = [
    'versichertennummer',
    'versicherungsnummer',
    'versicherten nummer',
    'krankenversicherungsnummer',
    'krankenkassennummer',
    'vnr',
    'ueber die nummer',
    'über die nummer',
    'mit der nummer',
    'versicherungs nummer',
  ];
  if (vnrKeywords.some((keyword) => normalized.includes(keyword))) return true;

  const candidate = normalizeVnrLoose(text).candidate;
  return Boolean(candidate && /^[A-Z][0-9]{9}$/.test(candidate));
}

function detectAddressPreference(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = normalizeText(text);
  const addressKeywords = [
    'postleitzahl',
    'plz',
    'adresse',
    'hausnummer',
    'geburtsdatum',
    'geburtstag',
    'post code',
    'postcode',
    'ueber die adresse',
    'über die adresse',
    'ueber die postleitzahl',
    'über die postleitzahl',
    'mit der postleitzahl',
    'mit der adresse',
  ];
  if (addressKeywords.some((keyword) => normalized.includes(keyword))) return true;

  return /\b\d{5}\b/.test(text);
}

function detectPathFromInput(
  latestCustomerInput: string | undefined,
  phoneLookupFound: boolean | undefined
): VerificationPath | null {
  if (phoneLookupFound === true) return 'phone';

  const text = latestCustomerInput?.trim();
  if (!text) return null;

  const wantsVnr = detectVnrPreference(text);
  const wantsAddress = detectAddressPreference(text);

  if (wantsVnr && !wantsAddress) return 'vnr';
  if (wantsAddress && !wantsVnr) return 'address';
  if (wantsVnr && wantsAddress) {
    const normalized = normalizeText(text);
    const vnrIndex = Math.min(
      ...['versichertennummer', 'versicherungsnummer', 'vnr']
        .map((keyword) => normalized.indexOf(keyword))
        .filter((index) => index >= 0)
    );
    const addressIndex = Math.min(
      ...['postleitzahl', 'plz', 'adresse', 'geburtsdatum', 'geburtstag']
        .map((keyword) => normalized.indexOf(keyword))
        .filter((index) => index >= 0)
    );
    if (Number.isFinite(vnrIndex) && Number.isFinite(addressIndex)) {
      return vnrIndex <= addressIndex ? 'vnr' : 'address';
    }
    return wantsVnr ? 'vnr' : 'address';
  }

  return null;
}

function buildChosenPathResult(
  path: VerificationPath,
  sessionId: string | undefined,
  sessionReceived: boolean
): VerificationMethodRouterResult {
  return {
    ok: true,
    action_type: 'SAY_ONLY',
    say: '',
    active_brain: path,
    next_brain: NEXT_BRAIN[path],
    requires_followup_mcp_call: true,
    session_id_received: sessionReceived,
    session_mode: sessionReceived ? 'session' : 'stateless',
  };
}

function persistPathChoice(
  sessionId: string | undefined,
  session: VerificationSessionState | null,
  path: VerificationPath,
  phoneLookupFound: boolean | undefined
): void {
  if (!sessionId || !session) return;
  session.active_verification_path = path;
  if (phoneLookupFound !== undefined) {
    session.phone_lookup_found = phoneLookupFound;
  } else if (path === 'phone') {
    session.phone_lookup_found = true;
  }
  storeVerificationSessionState(sessionId, session);
}

/**
 * Clone-only router: chooses verification method and stores it in MCP session state.
 * Does not perform CRM lookups. Returns a slim controller for Leaping Function nodes.
 */
export function runVerificationMethodRouter(
  rawInput: VerificationMethodRouterInput
): VerificationMethodRouterResult {
  const sessionId = rawInput.session_id;
  const session = loadVerificationSessionState(sessionId);
  const sessionReceived = Boolean(sessionId && session);

  if (session?.active_verification_path) {
    return buildChosenPathResult(session.active_verification_path, sessionId, sessionReceived);
  }

  const phoneLookupFound = rawInput.phone_lookup_found;

  if (phoneLookupFound === true) {
    persistPathChoice(sessionId, session, 'phone', true);
    return buildChosenPathResult('phone', sessionId, sessionReceived);
  }

  const detectedPath = detectPathFromInput(rawInput.latest_customer_input, phoneLookupFound);

  if (detectedPath) {
    persistPathChoice(sessionId, session, detectedPath, phoneLookupFound);
    return buildChosenPathResult(detectedPath, sessionId, sessionReceived);
  }

  return {
    ok: true,
    action_type: 'SAY_ONLY',
    say: buildMethodChoiceQuestion(rawInput.customer_intent),
    active_brain: null,
    next_brain: null,
    requires_followup_mcp_call: true,
    session_id_received: sessionReceived,
    session_mode: sessionReceived ? 'session' : 'stateless',
  };
}

import {
  getAnbieterContactByNormalizedName,
  listAnbieterContacts,
  upsertAnbieterContact,
  type AnbieterContactRow,
} from '../db.js';
import { appConfig } from '../config.js';
import {
  FUZZY_MATCH_THRESHOLD,
  normalizeAnbieterName,
  trigramSimilarity,
} from './anbieter-name.js';
import { discoverAnbieterContact } from './anbieter-web-search.js';
import type { AnbieterWebSearchConfig } from './anbieter-web-search.js';

export type AnbieterDraftConfidence = 'high' | 'medium' | 'low';
export type AnbieterDraftSource = 'cache' | 'web_search' | 'not_found';

export interface AnbieterCancellationDraftInput {
  anbieter_name: string;
}

export interface AnbieterCancellationDraftResult {
  ok: boolean;
  error?: string;
  draft: {
    to: string | null;
    subject: string;
    body: string;
  };
  confidence: AnbieterDraftConfidence;
  source: AnbieterDraftSource;
  needs_human_review: boolean;
  anbieter_name_normalized: string;
  placeholders: string[];
  cache_hit: boolean;
  search_provider?: 'brave' | 'duckduckgo_html' | 'none';
}

export interface AnbieterCancellationDraftDeps {
  webSearchConfig?: AnbieterWebSearchConfig;
  getContactByNormalized?: (normalized: string) => AnbieterContactRow | null;
  listContacts?: () => AnbieterContactRow[];
  upsertContact?: typeof upsertAnbieterContact;
  discoverContact?: typeof discoverAnbieterContact;
}

const PLACEHOLDERS = ['customer_name', 'customer_address', 'versichertennummer', 'anbieter_name'] as const;

const CANCELLATION_SUBJECT =
  'Kündigung der Pflegehilfsmittel-Versorgung – {{customer_name}}';

const CANCELLATION_BODY = `Sehr geehrte Damen und Herren,

hiermit kündige ich im Namen von {{customer_name}}, wohnhaft {{customer_address}}, Versichertennummer {{versichertennummer}}, die laufende Versorgung mit Pflegehilfsmitteln über {{anbieter_name}}.

Bitte bestätigen Sie mir den Beendigungstermin der Versorgung und stellen Sie sicher, dass keine Doppelversorgung entsteht.

Mit freundlichen Grüßen
Pflegemittelbox / DKN Pflege`;

export function buildCancellationDraftShell(anbieterDisplayName: string): {
  subject: string;
  body: string;
} {
  return {
    subject: CANCELLATION_SUBJECT,
    body: CANCELLATION_BODY.replace(/\{\{anbieter_name\}\}/g, anbieterDisplayName.trim()),
  };
}

export function findFuzzyAnbieterContact(
  normalized: string,
  rows: AnbieterContactRow[]
): { row: AnbieterContactRow; similarity: number } | null {
  let best: { row: AnbieterContactRow; similarity: number } | null = null;
  for (const row of rows) {
    const similarity = trigramSimilarity(normalized, row.anbieter_name_normalized);
    if (similarity < FUZZY_MATCH_THRESHOLD) continue;
    if (!best || similarity > best.similarity) {
      best = { row, similarity };
    }
  }
  return best;
}

function resolveDeps(deps?: AnbieterCancellationDraftDeps) {
  return {
    webSearchConfig: deps?.webSearchConfig ?? {
      braveApiKey: appConfig.BRAVE_SEARCH_API_KEY,
    },
    getContactByNormalized: deps?.getContactByNormalized ?? getAnbieterContactByNormalizedName,
    listContacts: deps?.listContacts ?? listAnbieterContacts,
    upsertContact: deps?.upsertContact ?? upsertAnbieterContact,
    discoverContact: deps?.discoverContact ?? discoverAnbieterContact,
  };
}

export function coerceAnbieterCancellationDraftInput(
  input: Record<string, unknown>
): AnbieterCancellationDraftInput {
  const anbieter_name =
    typeof input.anbieter_name === 'string' ? input.anbieter_name.trim() : '';
  if (!anbieter_name) {
    throw new Error('"anbieter_name" (string) is required');
  }
  return { anbieter_name };
}

export async function runAnbieterCancellationDraft(
  input: AnbieterCancellationDraftInput,
  deps?: AnbieterCancellationDraftDeps
): Promise<AnbieterCancellationDraftResult> {
  const resolved = resolveDeps(deps);
  const normalized = normalizeAnbieterName(input.anbieter_name);
  if (!normalized) {
    return {
      ok: false,
      error: 'anbieter_name could not be normalized',
      draft: { to: null, subject: CANCELLATION_SUBJECT, body: CANCELLATION_BODY },
      confidence: 'low',
      source: 'not_found',
      needs_human_review: true,
      anbieter_name_normalized: '',
      placeholders: [...PLACEHOLDERS],
      cache_hit: false,
    };
  }

  const shell = buildCancellationDraftShell(input.anbieter_name);
  let email: string | null = null;
  let confidence: AnbieterDraftConfidence = 'low';
  let source: AnbieterDraftSource = 'not_found';
  let cacheHit = false;
  let searchProvider: 'brave' | 'duckduckgo_html' | 'none' | undefined;
  let humanConfirmed = false;

  const exact = resolved.getContactByNormalized(normalized);
  const fuzzy = exact ? null : findFuzzyAnbieterContact(normalized, resolved.listContacts());
  const cached = exact ?? fuzzy?.row ?? null;

  if (cached?.email) {
    cacheHit = true;
    source = 'cache';
    email = cached.email;
    confidence = cached.confidence ?? 'medium';
    humanConfirmed = cached.human_confirmed === 1;
  } else {
    const discovered = await resolved.discoverContact(
      input.anbieter_name,
      normalized,
      resolved.webSearchConfig
    );
    searchProvider = discovered.search_provider;
    email = discovered.contact.email;
    confidence = discovered.contact.confidence;
    source = email ? 'web_search' : 'not_found';

    resolved.upsertContact({
      anbieter_name_normalized: normalized,
      anbieter_name_display: input.anbieter_name.trim(),
      email,
      fax: discovered.contact.fax,
      postal_address: discovered.contact.postal_address,
      confidence,
      human_confirmed: false,
      source_url: discovered.contact.source_url,
      last_verified_at: new Date().toISOString(),
    });
  }

  const needsHumanReview = source !== 'cache' || !humanConfirmed || !email;

  return {
    ok: true,
    draft: {
      to: email,
      subject: shell.subject,
      body: shell.body,
    },
    confidence,
    source,
    needs_human_review: needsHumanReview,
    anbieter_name_normalized: normalized,
    placeholders: [...PLACEHOLDERS],
    cache_hit: cacheHit,
    search_provider: searchProvider,
  };
}

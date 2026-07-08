import { extractContactFromHtml } from './anbieter-contact-extract.js';
import type { ExtractedAnbieterContact } from './anbieter-contact-extract.js';

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface AnbieterWebSearchConfig {
  braveApiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const USER_AGENT =
  'PflegemittelboxMCP/0.1 (+https://pflegemittelbox.de; anbieter-contact-lookup)';

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildAnbieterSearchQuery(anbieterName: string): string {
  return `"${anbieterName.trim()}" Pflegebox kündigen email kontakt`;
}

export async function searchBraveWeb(
  query: string,
  config: AnbieterWebSearchConfig
): Promise<WebSearchResult[]> {
  const apiKey = config.braveApiKey?.trim();
  if (!apiKey) return [];

  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');
  url.searchParams.set('search_lang', 'de');
  url.searchParams.set('country', 'DE');

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    },
    fetchFn,
    timeoutMs
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (payload.web?.results ?? [])
    .filter((row) => typeof row.url === 'string' && row.url.startsWith('http'))
    .map((row) => ({
      title: row.title ?? '',
      url: row.url ?? '',
      description: row.description ?? '',
    }));
}

/** Free HTML scrape fallback when Brave is unavailable. */
export async function searchDuckDuckGoHtml(
  query: string,
  config: AnbieterWebSearchConfig
): Promise<WebSearchResult[]> {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = new URLSearchParams({ q: query, kl: 'de-de' });

  const response = await fetchWithTimeout(
    'https://html.duckduckgo.com/html/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: body.toString(),
    },
    fetchFn,
    timeoutMs
  );

  if (!response.ok) return [];

  const html = await response.text();
  const results: WebSearchResult[] = [];
  const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    const url = decodeDuckDuckGoRedirect(rawUrl);
    if (url.startsWith('http')) {
      results.push({ title, url, description: '' });
    }
  }
  return results;
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    if (href.startsWith('http')) return href;
    const params = new URLSearchParams(href.replace(/^\/html\/l\?/, ''));
    const uddg = params.get('uddg');
    return uddg ? decodeURIComponent(uddg) : href;
  } catch {
    return href;
  }
}

export async function fetchPageHtml(url: string, config: AnbieterWebSearchConfig): Promise<string> {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    },
    fetchFn,
    timeoutMs
  );
  if (!response.ok) return '';
  return response.text();
}

function rankSearchResults(results: WebSearchResult[], anbieterNormalized: string): WebSearchResult[] {
  const tokens = anbieterNormalized.split(/\s+/).filter((t) => t.length >= 3);
  return [...results].sort((a, b) => scoreResult(b, tokens) - scoreResult(a, tokens));
}

function scoreResult(result: WebSearchResult, tokens: string[]): number {
  const haystack = `${result.title} ${result.url} ${result.description}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 3;
  }
  if (haystack.includes('kuendig') || haystack.includes('kündig')) score += 2;
  if (haystack.includes('pflegebox')) score += 1;
  if (/(pflege|apotheke|versicherung|kasse)\./i.test(result.url)) score += 1;
  return score;
}

export async function discoverAnbieterContact(
  anbieterName: string,
  anbieterNormalized: string,
  config: AnbieterWebSearchConfig
): Promise<{
  contact: ExtractedAnbieterContact;
  search_provider: 'brave' | 'duckduckgo_html' | 'none';
}> {
  const query = buildAnbieterSearchQuery(anbieterName);
  let provider: 'brave' | 'duckduckgo_html' | 'none' = 'none';
  let results: WebSearchResult[] = [];

  if (config.braveApiKey?.trim()) {
    results = await searchBraveWeb(query, config);
    if (results.length > 0) provider = 'brave';
  }

  if (results.length === 0) {
    results = await searchDuckDuckGoHtml(query, config);
    if (results.length > 0) provider = 'duckduckgo_html';
  }

  const ranked = rankSearchResults(results, anbieterNormalized);
  let best: ExtractedAnbieterContact = {
    email: null,
    fax: null,
    postal_address: null,
    confidence: 'low',
    source_url: null,
  };

  for (const result of ranked.slice(0, 3)) {
    try {
      const html = await fetchPageHtml(result.url, config);
      if (!html) continue;
      const extracted = extractContactFromHtml(html, result.url, anbieterNormalized);
      if (!extracted.email) continue;
      if (!best.email || confidenceRank(extracted.confidence) > confidenceRank(best.confidence)) {
        best = extracted;
      }
      if (best.confidence === 'high') break;
    } catch {
      // try next result
    }
  }

  return { contact: best, search_provider: provider };
}

function confidenceRank(value: 'high' | 'medium' | 'low'): number {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

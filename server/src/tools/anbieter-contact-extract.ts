const EMAIL_REGEX = /\b[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g;
const FAX_REGEX = /(?:fax|telefax)[:\s]*([+()\d\s./-]{6,})/gi;

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'w3.org',
  'schema.org',
  'sentry.io',
  'googleusercontent.com',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
  'instagram.com',
  'duckduckgo.com',
  'brave.com',
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
]);

const AGGREGATOR_HOST_MARKERS = [
  'kuendigung.org',
  'pflegekompass',
  'muster-vorlage',
  'kuendigungsvorlage',
  'vorlage.de',
  'ratgeber',
  'magazin',
  'wiki',
  'reddit.com',
  'chip.de',
  'focus.de',
  'welt.de',
];

const PREFERRED_LOCAL_PARTS = ['kuendig', 'kundig', 'kündig', 'pflegebox', 'pflege', 'service', 'kontakt', 'info'];

export interface ExtractedAnbieterContact {
  email: string | null;
  fax: string | null;
  postal_address: string | null;
  confidence: 'high' | 'medium' | 'low';
  source_url: string | null;
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(html: string): string {
  return decodeBasicHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function domainFromEmail(email: string): string {
  return email.split('@')[1]?.toLowerCase().replace(/^www\./, '') ?? '';
}

function hostnameFromUrl(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function anbieterDomainTokens(anbieterNormalized: string): string[] {
  const tokens = new Set<string>();
  for (const raw of anbieterNormalized.split(/\s+/)) {
    const token = raw.trim().toLowerCase();
    if (token.length < 3) continue;
    tokens.add(token);
    tokens.add(token.replace(/[^a-z0-9]/g, ''));
  }
  return [...tokens].filter((token) => token.length >= 3);
}

export function isAggregatorHost(host: string): boolean {
  const normalized = host.replace(/^www\./, '').toLowerCase();
  return AGGREGATOR_HOST_MARKERS.some((marker) => normalized.includes(marker));
}

export function hostContainsAnbieterToken(host: string, anbieterNormalized: string): boolean {
  const haystack = host.replace(/[^a-z0-9]/g, '');
  return anbieterDomainTokens(anbieterNormalized).some((token) => {
    const compact = token.replace(/[^a-z0-9]/g, '');
    return compact.length >= 3 && haystack.includes(compact);
  });
}

function emailDomainContainsAnbieterToken(email: string, anbieterNormalized: string): boolean {
  const domain = domainFromEmail(email).replace(/[^a-z0-9]/g, '');
  return anbieterDomainTokens(anbieterNormalized).some((token) => {
    const compact = token.replace(/[^a-z0-9]/g, '');
    return compact.length >= 3 && domain.includes(compact);
  });
}

/** Reject third-party magazine emails; require Anbieter token in email domain or on official page host. */
export function isPlausibleAnbieterEmail(
  email: string,
  anbieterNormalized: string,
  pageUrl: string
): boolean {
  const domain = domainFromEmail(email);
  if (!domain || BLOCKED_EMAIL_DOMAINS.has(domain)) return false;

  const host = hostnameFromUrl(pageUrl);
  const emailMatchesAnbieter = emailDomainContainsAnbieterToken(email, anbieterNormalized);
  const officialHost = host.length > 0 && hostContainsAnbieterToken(host, anbieterNormalized);

  if (isAggregatorHost(host)) {
    return emailMatchesAnbieter;
  }

  if (emailMatchesAnbieter) return true;

  if (officialHost) {
    const emailHost = domain;
    return host === emailHost || host.endsWith(`.${emailHost}`) || emailHost.endsWith(`.${host}`);
  }

  return false;
}

function scoreEmail(email: string, anbieterNormalized: string, pageText: string, pageUrl: string): number {
  const lower = email.toLowerCase();
  const domain = domainFromEmail(lower);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return -100;
  if (!isPlausibleAnbieterEmail(email, anbieterNormalized, pageUrl)) return -100;

  let score = 0;
  const local = lower.split('@')[0] ?? '';
  if (PREFERRED_LOCAL_PARTS.some((part) => local.includes(part))) score += 4;
  if (pageText.toLowerCase().includes('kündig') || pageText.toLowerCase().includes('kuendig')) score += 2;

  if (emailDomainContainsAnbieterToken(email, anbieterNormalized)) score += 8;

  const host = hostnameFromUrl(pageUrl);
  if (hostContainsAnbieterToken(host, anbieterNormalized)) score += 6;
  if (host && (host === domain || host.endsWith(`.${domain}`))) score += 4;

  if (isAggregatorHost(host)) score -= 20;

  return score;
}

export function extractEmailsFromText(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) ?? [];
  const unique = [...new Set(matches.map((m) => m.toLowerCase()))];
  return unique.filter((email) => !BLOCKED_EMAIL_DOMAINS.has(domainFromEmail(email)));
}

export function extractContactFromHtml(
  html: string,
  pageUrl: string,
  anbieterNormalized: string
): ExtractedAnbieterContact {
  const text = stripHtml(html);
  const emails = extractEmailsFromText(text);
  const urlLower = pageUrl.toLowerCase();
  const textLower = text.toLowerCase();

  const ranked = emails
    .map((email) => ({ email, score: scoreEmail(email, anbieterNormalized, text, pageUrl) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const bestEmail = ranked[0]?.email ?? null;
  const faxMatch = FAX_REGEX.exec(text);
  FAX_REGEX.lastIndex = 0;

  const host = hostnameFromUrl(pageUrl);
  const officialHost = hostContainsAnbieterToken(host, anbieterNormalized) && !isAggregatorHost(host);
  const emailOnOfficialDomain = Boolean(
    bestEmail && emailDomainContainsAnbieterToken(bestEmail, anbieterNormalized)
  );

  const cancellationPage =
    urlLower.includes('kuendig') ||
    urlLower.includes('kündig') ||
    textLower.includes('pflegebox kündigen') ||
    textLower.includes('pflegehilfsmittel kündigen') ||
    textLower.includes('vertragskündigung');

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (bestEmail && officialHost && emailOnOfficialDomain && cancellationPage) confidence = 'high';
  else if (bestEmail && emailOnOfficialDomain && officialHost) confidence = 'medium';
  else if (bestEmail && emailOnOfficialDomain) confidence = 'medium';
  else if (bestEmail) confidence = 'low';

  return {
    email: bestEmail,
    fax: faxMatch?.[1]?.trim() ?? null,
    postal_address: null,
    confidence,
    source_url: pageUrl,
  };
}

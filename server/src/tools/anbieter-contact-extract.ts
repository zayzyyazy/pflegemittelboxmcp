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
]);

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
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function scoreEmail(email: string, anbieterNormalized: string, pageText: string, pageUrl: string): number {
  const lower = email.toLowerCase();
  const domain = domainFromEmail(lower);
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return -100;

  let score = 0;
  const local = lower.split('@')[0] ?? '';
  if (PREFERRED_LOCAL_PARTS.some((part) => local.includes(part))) score += 4;
  if (pageText.toLowerCase().includes('kündig') || pageText.toLowerCase().includes('kuendig')) score += 3;

  const anbieterTokens = anbieterNormalized.split(/\s+/).filter((t) => t.length >= 3);
  if (anbieterTokens.some((token) => domain.includes(token))) score += 5;

  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '');
    if (domain && host.includes(domain.replace(/^www\./, ''))) score += 4;
    if (anbieterTokens.some((token) => host.includes(token))) score += 3;
  } catch {
    // ignore invalid URLs
  }

  if (domain.endsWith('.de')) score += 1;
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

  const officialDomain =
    ranked[0]?.score >= 5 ||
    anbieterNormalized.split(/\s+/).some((token) => token.length >= 3 && urlLower.includes(token));

  const cancellationPage =
    urlLower.includes('kuendig') ||
    urlLower.includes('kündig') ||
    textLower.includes('pflegebox kündigen') ||
    textLower.includes('pflegehilfsmittel kündigen');

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (bestEmail && officialDomain && cancellationPage) confidence = 'high';
  else if (bestEmail && officialDomain) confidence = 'medium';
  else if (bestEmail) confidence = 'low';

  return {
    email: bestEmail,
    fax: faxMatch?.[1]?.trim() ?? null,
    postal_address: null,
    confidence,
    source_url: pageUrl,
  };
}

export interface OutboundContactLookupInput {
  spoken_name?: string;
}

export interface OutboundContactLookupResult {
  ok: boolean;
  status: 'found' | 'not_found' | 'ambiguous';
  matched_name: string | null;
  phone_number: string | null;
  source_url: string | null;
  confidence: number;
  reason: string;
}

interface ContactDirectoryEntry {
  canonicalName: string;
  phoneNumber: string;
  sourceUrl: string;
  confidence: number;
  aliases: string[];
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' und ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripWords(value: string, words: string[]): string {
  const tokens = normalizeText(value).split(' ').filter(Boolean);
  const filtered = tokens.filter((token) => !words.includes(token));
  return filtered.join(' ').trim();
}

function uniqueCandidates(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildInsurerCandidates(rawName: string): string[] {
  return uniqueCandidates([
    rawName,
    stripWords(rawName, ['krankenkasse', 'kasse', 'versicherung', 'gesetzliche']),
  ]);
}

function buildProviderCandidates(rawName: string): string[] {
  return uniqueCandidates([
    rawName,
    stripWords(rawName, ['gmbh', 'ag', 'mbh', 'co', 'kg', 'und', 'the']),
  ]);
}

function findMatches(
  rawName: string,
  directory: readonly ContactDirectoryEntry[],
  buildCandidates: (rawName: string) => string[]
): ContactDirectoryEntry[] {
  const candidates = buildCandidates(rawName);
  const matches = new Map<string, ContactDirectoryEntry>();

  for (const entry of directory) {
    const normalizedAliases = entry.aliases.map((alias) => normalizeText(alias));
    if (candidates.some((candidate) => normalizedAliases.includes(candidate))) {
      matches.set(entry.canonicalName, entry);
    }
  }

  return [...matches.values()];
}

function notFound(reason: string): OutboundContactLookupResult {
  return {
    ok: false,
    status: 'not_found',
    matched_name: null,
    phone_number: null,
    source_url: null,
    confidence: 0,
    reason,
  };
}

function ambiguous(reason: string): OutboundContactLookupResult {
  return {
    ok: false,
    status: 'ambiguous',
    matched_name: null,
    phone_number: null,
    source_url: null,
    confidence: 0,
    reason,
  };
}

function found(entry: ContactDirectoryEntry, reason: string): OutboundContactLookupResult {
  return {
    ok: true,
    status: 'found',
    matched_name: entry.canonicalName,
    phone_number: entry.phoneNumber,
    source_url: entry.sourceUrl,
    confidence: entry.confidence,
    reason,
  };
}

const INSURER_DIRECTORY: readonly ContactDirectoryEntry[] = [
  {
    canonicalName: 'Techniker Krankenkasse',
    phoneNumber: '0800 285 85 85',
    sourceUrl: 'https://www.tk.de/lebenswelten/impressum-2013112',
    confidence: 0.99,
    aliases: ['tk', 'techniker', 'techniker krankenkasse', 'die techniker'],
  },
  {
    canonicalName: 'AOK Baden-Wuerttemberg',
    phoneNumber: '0711 76161923',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok baden wuerttemberg', 'aok baden-wuerttemberg', 'aok bw'],
  },
  {
    canonicalName: 'AOK Bayern',
    phoneNumber: '089 31 21 20',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok bayern'],
  },
  {
    canonicalName: 'AOK Bremen/Bremerhaven',
    phoneNumber: '0421 17610',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok bremen', 'aok bremerhaven', 'aok bremen bremerhaven'],
  },
  {
    canonicalName: 'AOK Hessen',
    phoneNumber: '069 66816-334000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok hessen'],
  },
  {
    canonicalName: 'AOK Niedersachsen',
    phoneNumber: '0800 0265637',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok niedersachsen'],
  },
  {
    canonicalName: 'AOK Nordost',
    phoneNumber: '0800 2650800',
    sourceUrl: 'https://www.aok.de/pk/kontakt-client-no/',
    confidence: 0.99,
    aliases: ['aok nordost', 'aok berlin', 'aok brandenburg', 'aok mecklenburg vorpommern'],
  },
  {
    canonicalName: 'AOK NordWest',
    phoneNumber: '0800 2655000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok nordwest', 'aok westfalen lippe', 'aok schleswig holstein'],
  },
  {
    canonicalName: 'AOK PLUS',
    phoneNumber: '0800 1059000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok plus', 'aok sachsen', 'aok thueringen', 'aok thüringen'],
  },
  {
    canonicalName: 'AOK Rheinland/Hamburg',
    phoneNumber: '0211 81950000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok rheinland', 'aok hamburg', 'aok rheinland hamburg'],
  },
  {
    canonicalName: 'AOK Rheinland-Pfalz/Saarland',
    phoneNumber: '06351 4030',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok rheinland pfalz', 'aok saarland', 'aok rheinland pfalz saarland'],
  },
  {
    canonicalName: 'AOK Sachsen-Anhalt',
    phoneNumber: '0800 2265726',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok sachsen anhalt'],
  },
] as const;

const PROVIDER_DIRECTORY: readonly ContactDirectoryEntry[] = [
  {
    canonicalName: 'PubliCare GmbH',
    phoneNumber: '0800 7090490',
    sourceUrl: 'https://www.publicare-gmbh.de/de/kontakt/',
    confidence: 0.99,
    aliases: ['publicare', 'publi care', 'public care', 'publicare gmbh', 'noma med', 'noma-med'],
  },
  {
    canonicalName: 'PAUL HARTMANN AG',
    phoneNumber: '0800 000 52 55',
    sourceUrl: 'https://www.hartmann.info/de-de/kundenloesungen/l/de/fuer-privatanwender/beratung-online',
    confidence: 0.97,
    aliases: ['hartmann', 'paul hartmann', 'hartmann ag', 'hartmann homecare'],
  },
] as const;

export function coerceOutboundContactLookupInput(
  input: Record<string, unknown>
): OutboundContactLookupInput {
  const spokenName =
    typeof input.spoken_name === 'string'
      ? input.spoken_name
      : typeof input.name === 'string'
        ? input.name
        : undefined;

  return {
    spoken_name: spokenName?.trim() || undefined,
  };
}

export function runKrankenkasseContactLookup(
  input: OutboundContactLookupInput
): OutboundContactLookupResult {
  const spokenName = input.spoken_name?.trim();
  if (!spokenName) {
    return notFound('No insurer name was provided.');
  }

  const normalized = normalizeText(spokenName);
  if (!normalized) {
    return notFound('The insurer name could not be normalized into a usable query.');
  }

  if (normalized === 'aok') {
    return ambiguous(
      'AOK alone is ambiguous because AOK has multiple regional insurers with different official service numbers.'
    );
  }

  const matches = findMatches(spokenName, INSURER_DIRECTORY, buildInsurerCandidates);
  if (matches.length === 0) {
    return notFound('No trustworthy official insurer contact number is curated for that spoken name.');
  }

  if (matches.length > 1) {
    return ambiguous('The insurer name matched multiple official insurers, so no number was returned.');
  }

  return found(matches[0], 'Matched against a curated alias and official insurer contact source.');
}

export function runProviderContactLookup(
  input: OutboundContactLookupInput
): OutboundContactLookupResult {
  const spokenName = input.spoken_name?.trim();
  if (!spokenName) {
    return notFound('No provider name was provided.');
  }

  const normalized = normalizeText(spokenName);
  if (!normalized) {
    return notFound('The provider name could not be normalized into a usable query.');
  }

  const matches = findMatches(spokenName, PROVIDER_DIRECTORY, buildProviderCandidates);
  if (matches.length === 0) {
    return notFound('No trustworthy official provider contact number is curated for that spoken name.');
  }

  if (matches.length > 1) {
    return ambiguous('The provider name matched multiple official providers, so no number was returned.');
  }

  return found(matches[0], 'Matched against a curated alias and official provider contact source.');
}

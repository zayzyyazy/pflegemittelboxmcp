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
  normalized_input: string | null;
  matched_alias: string | null;
  candidates: string[];
}

interface ContactDirectoryEntry {
  canonicalName: string;
  phoneNumber: string;
  sourceUrl: string;
  confidence: number;
  aliases: string[];
}

interface MatchResult {
  entries: ContactDirectoryEntry[];
  matchedAlias: string | null;
}

interface LookupOptions {
  entityLabel: string;
  ambiguousCandidatesByNormalizedQuery?: Record<string, string[]>;
}

const INSURER_GENERIC_WORDS = new Set([
  'die',
  'der',
  'das',
  'krankenkasse',
  'kasse',
  'versicherung',
  'gesetzliche',
  'gesetzlich',
]);

const PROVIDER_GENERIC_WORDS = new Set([
  'gmbh',
  'ag',
  'mbh',
  'kg',
  'co',
  'und',
  'the',
]);

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

function dedupeStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function withoutTokens(value: string, removableTokens: Set<string>): string {
  const filtered = normalizeText(value)
    .split(' ')
    .filter((token) => token && !removableTokens.has(token));

  return filtered.join(' ').trim();
}

function addCandidate(target: Set<string>, value: string): void {
  const normalized = normalizeText(value);
  if (normalized) {
    target.add(normalized);
  }
}

function buildInsurerCandidates(rawName: string): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeText(rawName);
  addCandidate(candidates, normalized);

  const stripped = withoutTokens(normalized, INSURER_GENERIC_WORDS);
  addCandidate(candidates, stripped);

  if (normalized.includes('betriebskrankenkasse')) {
    addCandidate(
      candidates,
      normalized.replace(/\bbetriebskrankenkasse\b/g, 'bkk').replace(/\s+/g, ' ').trim()
    );
  }

  if (normalized.includes('bkk')) {
    addCandidate(
      candidates,
      normalized.replace(/\bbkk\b/g, 'betriebskrankenkasse').replace(/\s+/g, ' ').trim()
    );
  }

  if (stripped.includes('betriebskrankenkasse')) {
    addCandidate(
      candidates,
      stripped.replace(/\bbetriebskrankenkasse\b/g, 'bkk').replace(/\s+/g, ' ').trim()
    );
  }

  if (stripped.includes('bkk')) {
    addCandidate(
      candidates,
      stripped.replace(/\bbkk\b/g, 'betriebskrankenkasse').replace(/\s+/g, ' ').trim()
    );
  }

  return [...candidates];
}

function buildProviderCandidates(rawName: string): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeText(rawName);
  addCandidate(candidates, normalized);
  addCandidate(candidates, withoutTokens(normalized, PROVIDER_GENERIC_WORDS));
  return [...candidates];
}

function createAliasIndex(directory: readonly ContactDirectoryEntry[]): Map<string, ContactDirectoryEntry[]> {
  const aliasIndex = new Map<string, ContactDirectoryEntry[]>();

  for (const entry of directory) {
    const normalizedAliases = dedupeStrings([entry.canonicalName, ...entry.aliases]);
    for (const alias of normalizedAliases) {
      const existing = aliasIndex.get(alias);
      if (existing) {
        existing.push(entry);
      } else {
        aliasIndex.set(alias, [entry]);
      }
    }
  }

  return aliasIndex;
}

function uniqueCanonicalNames(entries: readonly ContactDirectoryEntry[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    if (seen.has(entry.canonicalName)) continue;
    seen.add(entry.canonicalName);
    result.push(entry.canonicalName);
  }

  return result;
}

function findMatches(
  rawName: string,
  aliasIndex: Map<string, ContactDirectoryEntry[]>,
  buildCandidates: (rawName: string) => string[]
): MatchResult {
  const entries = new Map<string, ContactDirectoryEntry>();
  let matchedAlias: string | null = null;

  for (const candidate of buildCandidates(rawName)) {
    const matchedEntries = aliasIndex.get(candidate);
    if (!matchedEntries?.length) continue;
    if (matchedAlias === null) {
      matchedAlias = candidate;
    }

    for (const entry of matchedEntries) {
      entries.set(entry.canonicalName, entry);
    }
  }

  return {
    entries: [...entries.values()],
    matchedAlias,
  };
}

function notFound(reason: string, normalizedInput: string | null): OutboundContactLookupResult {
  return {
    ok: false,
    status: 'not_found',
    matched_name: null,
    phone_number: null,
    source_url: null,
    confidence: 0,
    reason,
    normalized_input: normalizedInput,
    matched_alias: null,
    candidates: [],
  };
}

function ambiguous(
  reason: string,
  normalizedInput: string,
  candidates: string[],
  matchedAlias: string | null
): OutboundContactLookupResult {
  return {
    ok: false,
    status: 'ambiguous',
    matched_name: null,
    phone_number: null,
    source_url: null,
    confidence: 0,
    reason,
    normalized_input: normalizedInput,
    matched_alias: matchedAlias,
    candidates,
  };
}

function found(
  entry: ContactDirectoryEntry,
  reason: string,
  normalizedInput: string,
  matchedAlias: string | null
): OutboundContactLookupResult {
  return {
    ok: true,
    status: 'found',
    matched_name: entry.canonicalName,
    phone_number: entry.phoneNumber,
    source_url: entry.sourceUrl,
    confidence: entry.confidence,
    reason,
    normalized_input: normalizedInput,
    matched_alias: matchedAlias,
    candidates: [],
  };
}

function runLookup(
  input: OutboundContactLookupInput,
  aliasIndex: Map<string, ContactDirectoryEntry[]>,
  buildCandidates: (rawName: string) => string[],
  options: LookupOptions
): OutboundContactLookupResult {
  const spokenName = input.spoken_name?.trim();
  if (!spokenName) {
    return notFound(`No ${options.entityLabel} name was provided.`, null);
  }

  const normalizedInput = normalizeText(spokenName);
  if (!normalizedInput) {
    return notFound(
      `The ${options.entityLabel} name could not be normalized into a usable query.`,
      null
    );
  }

  const genericCandidates = options.ambiguousCandidatesByNormalizedQuery?.[normalizedInput];
  if (genericCandidates?.length) {
    return ambiguous(
      `${spokenName} is ambiguous because multiple ${options.entityLabel} entries could match that generic name.`,
      normalizedInput,
      genericCandidates,
      normalizedInput,
    );
  }

  const { entries, matchedAlias } = findMatches(spokenName, aliasIndex, buildCandidates);

  if (!entries.length) {
    return notFound(
      `No trustworthy official contact number was found for ${options.entityLabel} name "${spokenName}".`,
      normalizedInput,
    );
  }

  if (entries.length > 1) {
    return ambiguous(
      `${spokenName} is ambiguous because multiple ${options.entityLabel} entries matched exactly after normalization.`,
      normalizedInput,
      uniqueCanonicalNames(entries),
      matchedAlias,
    );
  }

  return found(
    entries[0],
    `Matched ${options.entityLabel} contact from the curated official-source directory.`,
    normalizedInput,
    matchedAlias,
  );
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
    canonicalName: 'BARMER',
    phoneNumber: '0202 568 333 1010',
    sourceUrl: 'https://www.barmer.de/ueber-diese-website/impressum-1003148',
    confidence: 0.99,
    aliases: ['barmer', 'barmer krankenkasse'],
  },
  {
    canonicalName: 'DAK-Gesundheit',
    phoneNumber: '040 325 325 555',
    sourceUrl: 'https://www.dak.de/dak/kontaktuebersicht_2840',
    confidence: 0.98,
    aliases: ['dak', 'dak gesundheit', 'dak gesundheitskasse'],
  },
  {
    canonicalName: 'KKH Kaufmaennische Krankenkasse',
    phoneNumber: '0800 554 864 0554',
    sourceUrl: 'https://www.kkh.de/kontakt',
    confidence: 0.98,
    aliases: ['kkh', 'kkh kaufmaennische krankenkasse', 'kaufmaennische krankenkasse'],
  },
  {
    canonicalName: 'hkk Krankenkasse',
    phoneNumber: '0421 3655-0',
    sourceUrl: 'https://www.hkk.de/impressum',
    confidence: 0.98,
    aliases: ['hkk', 'hkk krankenkasse', 'handelskrankenkasse'],
  },
  {
    canonicalName: 'HEK - Hanseatische Krankenkasse',
    phoneNumber: '0800 0213213',
    sourceUrl: 'https://www.hek.de/impressum/',
    confidence: 0.98,
    aliases: ['hek', 'hanseatische krankenkasse', 'hek hanseatische krankenkasse'],
  },
  {
    canonicalName: 'AOK Baden-Wuerttemberg',
    phoneNumber: '0711 76161923',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: [
      'aok baden wuerttemberg',
      'aok baden-wuerttemberg',
      'aok baden wurttemberg',
      'aok bw',
    ],
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
    aliases: [
      'aok nordost',
      'aok berlin',
      'aok brandenburg',
      'aok mecklenburg vorpommern',
      'aok mecklenburg-vorpommern',
    ],
  },
  {
    canonicalName: 'AOK NordWest',
    phoneNumber: '0800 2655000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: [
      'aok nordwest',
      'aok westfalen lippe',
      'aok westfalen-lippe',
      'aok schleswig holstein',
      'aok schleswig-holstein',
    ],
  },
  {
    canonicalName: 'AOK PLUS',
    phoneNumber: '0800 1059000',
    sourceUrl: 'https://www.aok.de/pk/kontakt/servicenummern-client-rh/',
    confidence: 0.98,
    aliases: ['aok plus', 'aok sachsen', 'aok thueringen', 'aok thuringen', 'aok thueringen'],
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
    aliases: ['aok sachsen anhalt', 'aok sachsen-anhalt'],
  },
  {
    canonicalName: 'vivida bkk',
    phoneNumber: '07720 9727-0',
    sourceUrl: 'https://www.vividabkk.de/de/service/kontakt',
    confidence: 0.98,
    aliases: ['vivida', 'vivida bkk'],
  },
  {
    canonicalName: 'BKK Diakonie',
    phoneNumber: '0521 329876 - 120',
    sourceUrl: 'https://www.bkk-diakonie.de/kontakt/',
    confidence: 0.98,
    aliases: ['bkk diakonie', 'diakonie bkk'],
  },
  {
    canonicalName: 'Audi BKK',
    phoneNumber: '0841 887-0',
    sourceUrl: 'https://www.audibkk-gesundheit.de/impressum/',
    confidence: 0.96,
    aliases: ['audi', 'audi bkk'],
  },
  {
    canonicalName: 'BAHN-BKK',
    phoneNumber: '0800 22 46 255',
    sourceUrl: 'https://www.bahn-bkk.de/service/kontakt-standorte/telefonnummern.html',
    confidence: 0.98,
    aliases: ['bahn bkk', 'bahn krankenkasse', 'bahn betriebskrankenkasse'],
  },
  {
    canonicalName: 'BIG direkt gesund',
    phoneNumber: '0231 5557 0',
    sourceUrl: 'https://www.big-direkt.de/de/kontakt',
    confidence: 0.98,
    aliases: ['big', 'big direkt', 'big direkt gesund'],
  },
  {
    canonicalName: 'BERGISCHE KRANKENKASSE',
    phoneNumber: '0212 2262-0',
    sourceUrl: 'https://www.bergische-krankenkasse.de/kontakt',
    confidence: 0.98,
    aliases: ['bergische', 'bergische krankenkasse'],
  },
  {
    canonicalName: 'BKK firmus',
    phoneNumber: '0421 64343',
    sourceUrl: 'https://www.bkk-firmus.de/mitgliedschaft/online-antrag?makler_id=161',
    confidence: 0.95,
    aliases: ['bkk firmus', 'firmus', 'firmus bkk'],
  },
  {
    canonicalName: 'energie-BKK',
    phoneNumber: '0511 911 10 911',
    sourceUrl: 'https://www.energie-bkk.de/kontakt/',
    confidence: 0.98,
    aliases: ['energie bkk', 'energie-bkk', 'energie betriebskrankenkasse'],
  },
  {
    canonicalName: 'Pronova BKK',
    phoneNumber: '0621 53391-1000',
    sourceUrl: 'https://www.pronovabkk.de/kontakt/',
    confidence: 0.98,
    aliases: ['pronova', 'pronova bkk'],
  },
  {
    canonicalName: 'Salus BKK',
    phoneNumber: '0800 22 13 222',
    sourceUrl: 'https://www.salus-bkk.de/kontaktformular',
    confidence: 0.97,
    aliases: ['salus', 'salus bkk'],
  },
  {
    canonicalName: 'SBK Siemens-Betriebskrankenkasse',
    phoneNumber: '0800 072 572 572 50',
    sourceUrl: 'https://www.sbk.org/app/legal-information/',
    confidence: 0.98,
    aliases: [
      'sbk',
      'siemens betriebskrankenkasse',
      'siemens-betriebskrankenkasse',
      'sbk siemens betriebskrankenkasse',
    ],
  },
  {
    canonicalName: 'Mobil Krankenkasse',
    phoneNumber: '0800 255 0800',
    sourceUrl: 'https://mobil-krankenkasse.de/kontakt.html',
    confidence: 0.98,
    aliases: ['mobil', 'mobil krankenkasse'],
  },
  {
    canonicalName: 'mhplus Krankenkasse',
    phoneNumber: '07141 9790-0',
    sourceUrl: 'https://www.mhplus-krankenkasse.de/impressum',
    confidence: 0.98,
    aliases: ['mhplus', 'mhplus krankenkasse'],
  },
  {
    canonicalName: 'VIACTIV Krankenkasse',
    phoneNumber: '0800 222 12 11',
    sourceUrl: 'https://www.viactiv.de/kontakt',
    confidence: 0.98,
    aliases: ['viactiv', 'viactiv krankenkasse'],
  },
  {
    canonicalName: 'IKK classic',
    phoneNumber: '0800 455 1111',
    sourceUrl: 'https://www.ikk-classic.de/impressum.html',
    confidence: 0.98,
    aliases: ['ikk classic'],
  },
  {
    canonicalName: 'IKK gesund plus',
    phoneNumber: '0800 8579840',
    sourceUrl: 'https://www.ikk-gesundplus.de/service/beratung-hotlines/kontakt/',
    confidence: 0.98,
    aliases: ['ikk gesund plus', 'ikk gesundplus', 'ikk gesund-plus'],
  },
  {
    canonicalName: 'KNAPPSCHAFT',
    phoneNumber: '08000 200 501',
    sourceUrl: 'https://www.knappschaft.de/kontakt/kontakt',
    confidence: 0.98,
    aliases: [
      'knappschaft',
      'knappschaft bahn see',
      'deutsche rentenversicherung knappschaft bahn see',
    ],
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
  {
    canonicalName: 'Sanubi',
    phoneNumber: '030 555 7850 65',
    sourceUrl: 'https://sanubi.de/kontakt/',
    confidence: 0.97,
    aliases: ['sanubi', 'sanubibox', 'sanubi box', 'sanubi pflegebox', 'sanu bi'],
  },
  {
    canonicalName: 'Pflegebox (proSenio GmbH)',
    phoneNumber: '030 863 235 450',
    sourceUrl: 'https://pflegebox.de/kontakt/',
    confidence: 0.99,
    aliases: ['prosenio', 'pro senio', 'prosenio pflegebox', 'pflegebox prosenio'],
  },
  {
    canonicalName: 'curabox Pflege',
    phoneNumber: '040 / 87 40 97 57',
    sourceUrl: 'https://www.curabox.de/pflege/kontakt',
    confidence: 0.98,
    aliases: ['curabox', 'cura box', 'cura-box', 'curabox pflege'],
  },
  {
    canonicalName: 'Pflegehase',
    phoneNumber: '0541 4401 69 68',
    sourceUrl: 'https://pflegehase.de/kontakt/',
    confidence: 0.98,
    aliases: ['pflegehase', 'pflege hase'],
  },
  {
    canonicalName: 'Pflegemittelbox.de',
    phoneNumber: '0211 879 77777',
    sourceUrl: 'https://pflegemittelbox.de/impressum/',
    confidence: 0.98,
    aliases: ['pflegemittelbox', 'pflege mittel box', 'dkn pflege', 'pflegemittelbox de'],
  },
  {
    canonicalName: 'Box4pflege.de',
    phoneNumber: '+49 7661 9759 015',
    sourceUrl: 'https://box4pflege.de/impressum/',
    confidence: 0.96,
    aliases: ['box4pflege', 'box 4 pflege', 'box fuer pflege', 'box fur pflege'],
  },
] as const;

const GENERIC_INSURER_AMBIGUITIES: Record<string, string[]> = {
  aok: uniqueCanonicalNames(INSURER_DIRECTORY.filter((entry) => entry.canonicalName.startsWith('AOK '))),
  bkk: uniqueCanonicalNames(INSURER_DIRECTORY.filter((entry) => /\bbkk\b/i.test(entry.canonicalName))),
  betriebskrankenkasse: uniqueCanonicalNames(
    INSURER_DIRECTORY.filter(
      (entry) => /\bbkk\b/i.test(entry.canonicalName) || /betriebskrankenkasse/i.test(entry.canonicalName)
    )
  ),
  ikk: uniqueCanonicalNames(INSURER_DIRECTORY.filter((entry) => entry.canonicalName.startsWith('IKK '))),
};

const GENERIC_PROVIDER_AMBIGUITIES: Record<string, string[]> = {
  pflegebox: [
    'Pflegebox (proSenio GmbH)',
    'Sanubi',
    'curabox Pflege',
    'Pflegemittelbox.de',
    'Box4pflege.de',
  ],
  'pflege box': [
    'Pflegebox (proSenio GmbH)',
    'Sanubi',
    'curabox Pflege',
    'Pflegemittelbox.de',
    'Box4pflege.de',
  ],
};

const INSURER_ALIAS_INDEX = createAliasIndex(INSURER_DIRECTORY);
const PROVIDER_ALIAS_INDEX = createAliasIndex(PROVIDER_DIRECTORY);

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
  return runLookup(input, INSURER_ALIAS_INDEX, buildInsurerCandidates, {
    entityLabel: 'insurer',
    ambiguousCandidatesByNormalizedQuery: GENERIC_INSURER_AMBIGUITIES,
  });
}

export function runProviderContactLookup(
  input: OutboundContactLookupInput
): OutboundContactLookupResult {
  return runLookup(input, PROVIDER_ALIAS_INDEX, buildProviderCandidates, {
    entityLabel: 'provider',
    ambiguousCandidatesByNormalizedQuery: GENERIC_PROVIDER_AMBIGUITIES,
  });
}

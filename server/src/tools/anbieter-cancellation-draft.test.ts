import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnbieterName, trigramSimilarity } from './anbieter-name.js';
import { extractContactFromHtml, extractEmailsFromText } from './anbieter-contact-extract.js';
import {
  buildCancellationDraftShell,
  findFuzzyAnbieterContact,
  runAnbieterCancellationDraft,
} from './anbieter-cancellation-draft.js';
import type { AnbieterContactRow } from '../db.js';

test('normalizeAnbieterName strips legal suffixes and casing', () => {
  assert.equal(normalizeAnbieterName('  AOK Pflegebox GmbH '), 'aok pflegebox');
});

test('trigramSimilarity matches close typo variants', () => {
  const a = normalizeAnbieterName('AOK Pflegebox');
  const b = normalizeAnbieterName('AOK Pflege Box');
  assert.ok(trigramSimilarity(a, b) >= 0.55);
});

test('extractEmailsFromText prefers real contact emails', () => {
  const emails = extractEmailsFromText('Kontakt: kuendigung@aok-pflegebox.de oder info@example.com');
  assert.deepEqual(emails, ['kuendigung@aok-pflegebox.de']);
});

test('extractContactFromHtml scores official cancellation email higher', () => {
  const html = `
    <html><body>
      <h1>Pflegebox kündigen</h1>
      <p>Bitte schreiben Sie an kuendigung@aok-pflegebox.de</p>
    </body></html>
  `;
  const extracted = extractContactFromHtml(html, 'https://www.aok-pflegebox.de/kuendigen', 'aok pflegebox');
  assert.equal(extracted.email, 'kuendigung@aok-pflegebox.de');
  assert.equal(extracted.confidence, 'high');
});

test('buildCancellationDraftShell uses placeholders for Marie', () => {
  const shell = buildCancellationDraftShell('AOK Pflegebox');
  assert.match(shell.subject, /\{\{customer_name\}\}/);
  assert.match(shell.body, /\{\{customer_address\}\}/);
  assert.match(shell.body, /\{\{versichertennummer\}\}/);
  assert.match(shell.body, /AOK Pflegebox/);
});

test('findFuzzyAnbieterContact returns close cache row', () => {
  const rows: AnbieterContactRow[] = [
    {
      anbieter_name_normalized: 'aok pflegebox',
      anbieter_name_display: 'AOK Pflegebox',
      email: 'kuendigung@aok-pflegebox.de',
      fax: null,
      postal_address: null,
      confidence: 'high',
      human_confirmed: 1,
      source_url: null,
      last_verified_at: null,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  const hit = findFuzzyAnbieterContact(normalizeAnbieterName('AOK Pflege Box'), rows);
  assert.ok(hit);
  assert.equal(hit?.row.email, 'kuendigung@aok-pflegebox.de');
});

test('extractContactFromHtml rejects third-party magazine email for Sanubi', () => {
  const html = `
    <html><body>
      <h1>Sanubi Pflegebox kündigen</h1>
      <p>Fragen? hilfe@pflegekompassmagazin.de</p>
    </body></html>
  `;
  const extracted = extractContactFromHtml(
    html,
    'https://www.pflegekompassmagazin.de/sanubi-kuendigen/',
    'sanubi'
  );
  assert.equal(extracted.email, null);
  assert.equal(extracted.confidence, 'low');
});

test('extractEmailsFromText decodes info[at]sanubi.de obfuscation', () => {
  const emails = extractEmailsFromText('Bitte schreiben Sie an info[at]sanubi.de');
  assert.deepEqual(emails, ['info@sanubi.de']);
});

test('extractContactFromHtml decodes service{at]sanubi.com obfuscation', () => {
  const extracted = extractContactFromHtml(
    '<p>service{at]sanubi.com</p>',
    'https://sanubi.de/kontakt/',
    'sanubi'
  );
  assert.equal(extracted.email, 'service@sanubi.com');
});

test('extractContactFromHtml accepts official Sanubi email', () => {
  const html = `
    <html><body>
      <h1>Pflegebox kündigen</h1>
      <p>Schreiben Sie an info@sanubi.de</p>
    </body></html>
  `;
  const extracted = extractContactFromHtml(html, 'https://sanubi.de/faq/', 'sanubi');
  assert.equal(extracted.email, 'info@sanubi.de');
  assert.ok(['high', 'medium'].includes(extracted.confidence));
});

test('runAnbieterCancellationDraft ignores bad cache and re-searches', async () => {
  const rows: AnbieterContactRow[] = [
    {
      anbieter_name_normalized: 'sanubi',
      anbieter_name_display: 'Sanubi',
      email: 'hilfe@pflegekompassmagazin.de',
      fax: null,
      postal_address: null,
      confidence: 'high',
      human_confirmed: 0,
      source_url: 'https://www.pflegekompassmagazin.de/sanubi-kuendigen/',
      last_verified_at: null,
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  let searched = false;
  const result = await runAnbieterCancellationDraft(
    { anbieter_name: 'Sanubi' },
    {
      listContacts: () => rows,
      getContactByNormalized: (normalized) =>
        rows.find((row) => row.anbieter_name_normalized === normalized) ?? null,
      discoverContact: async () => {
        searched = true;
        return {
          contact: {
            email: 'info@sanubi.de',
            fax: null,
            postal_address: null,
            confidence: 'medium',
            source_url: 'https://sanubi.de/faq/',
          },
          search_provider: 'brave',
        };
      },
      upsertContact: () => undefined,
    }
  );

  assert.equal(searched, true);
  assert.equal(result.cache_hit, false);
  assert.equal(result.draft.to, 'info@sanubi.de');
});

test('runAnbieterCancellationDraft uses confirmed cache without web search', async () => {
  const rows: AnbieterContactRow[] = [
    {
      anbieter_name_normalized: 'aok pflegebox',
      anbieter_name_display: 'AOK Pflegebox',
      email: 'kuendigung@aok-pflegebox.de',
      fax: null,
      postal_address: null,
      confidence: 'high',
      human_confirmed: 1,
      source_url: 'https://www.aok-pflegebox.de/kuendigen',
      last_verified_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  let searched = false;
  const result = await runAnbieterCancellationDraft(
    { anbieter_name: 'AOK Pflegebox GmbH' },
    {
      listContacts: () => rows,
      getContactByNormalized: (normalized) =>
        rows.find((row) => row.anbieter_name_normalized === normalized) ?? null,
      discoverContact: async () => {
        searched = true;
        return {
          contact: { email: null, fax: null, postal_address: null, confidence: 'low', source_url: null },
          search_provider: 'none',
        };
      },
      upsertContact: () => undefined,
    }
  );

  assert.equal(searched, false);
  assert.equal(result.source, 'cache');
  assert.equal(result.draft.to, 'kuendigung@aok-pflegebox.de');
  assert.equal(result.needs_human_review, false);
});

test('runAnbieterCancellationDraft web search saves unconfirmed contact', async () => {
  const saved: Array<Record<string, unknown>> = [];
  const result = await runAnbieterCancellationDraft(
    { anbieter_name: 'Neuer Anbieter XY' },
    {
      listContacts: () => [],
      getContactByNormalized: () => null,
      discoverContact: async () => ({
        contact: {
          email: 'kontakt@neuer-anbieter.de',
          fax: null,
          postal_address: null,
          confidence: 'medium',
          source_url: 'https://www.neuer-anbieter.de/kontakt',
        },
        search_provider: 'brave',
      }),
      upsertContact: (entry) => {
        saved.push(entry as unknown as Record<string, unknown>);
      },
    }
  );

  assert.equal(result.source, 'web_search');
  assert.equal(result.draft.to, 'kontakt@neuer-anbieter.de');
  assert.equal(result.needs_human_review, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.human_confirmed, false);
});

test('runAnbieterCancellationDraft returns null to when nothing found', async () => {
  const result = await runAnbieterCancellationDraft(
    { anbieter_name: 'Unbekannter Anbieter' },
    {
      listContacts: () => [],
      getContactByNormalized: () => null,
      discoverContact: async () => ({
        contact: { email: null, fax: null, postal_address: null, confidence: 'low', source_url: null },
        search_provider: 'duckduckgo_html',
      }),
      upsertContact: () => undefined,
    }
  );

  assert.equal(result.source, 'not_found');
  assert.equal(result.draft.to, null);
  assert.equal(result.needs_human_review, true);
});

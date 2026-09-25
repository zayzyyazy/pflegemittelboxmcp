# Call Insights (separate from MCP runtime)

Export Leaping calls → rule-based + optional LLM analysis → **PDF / Markdown / JSON** report for DKN/Marie.

This tool lives **outside** the MCP server on purpose: learn from real calls first, then fix Marie Dialogue, Leaping bindings, or (only if needed) MCP surgically.

**Production Marie** uses Leaping Dialogue + native HTTP functions (`recognize_customer_by_phone`, VNR, PLZ/Geburtstag, `check_birthday`). MCP brains (`pmb_verification_*`) are a separate clone experiment — call-insights detects them per-call but does **not** expect them on live traffic.

## Where to run

| Tool | Server path | Deployed by `server deploy`? |
|------|-------------|------------------------------|
| **MCP** (Marie brains) | `/opt/pflegemittelboxmcp/server` | Yes — PM2 `pflegemittelbox-mcp` |
| **call-insights** (reports) | `/opt/pflegemittelboxmcp/call-insights` | **No** — manual setup |

`call-insights` is **not** in `~/call-insights`. On Hetzner it is inside the git repo (branch `cursor/call-insights-export-6983` until merged to `master`).

```bash
cd /opt/pflegemittelboxmcp
git fetch origin cursor/call-insights-export-6983
git checkout cursor/call-insights-export-6983
cd call-insights
cp .env.example .env
nano .env   # LEAPING_ACCESS_TOKEN + LEAPING_AGENT_ID
npm install
npm run report -- --days 7 --limit 100
```

Reports: `/opt/pflegemittelboxmcp/call-insights/reports/`. You can also run on your Mac — only Leaping API access needed.

## Leaping auth (Bearer token, not API key)

Leaping does **not** use a standalone API key. You get a **Bearer access token** from login:

```bash
# 1) Login → copy access_token from JSON response
curl -X POST "https://api.leaping.ai/v1/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=YOUR_EMAIL&password=YOUR_PASSWORD&grant_type=password"

# 2) Fetch calls with that token
curl "https://api.leaping.ai/v1/calls/?agent_id=YOUR_AGENT_ID&limit=50" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Optional query params: `start_date`, `end_date`, `status`, `offset`, `limit`, `order_by`.

### Use with this tool

**Recommended — username/password** (auto-login + refresh on 401):

```bash
LEAPING_API_USERNAME=you@example.com
LEAPING_API_PASSWORD=...
LEAPING_AGENT_ID=550e8400-...
```

Tokens expire after ~15 minutes. With username/password the tool calls `POST /v1/login` before each report and **re-logins automatically** if the API returns 401.

**Optional — pasted token** (one-off; expires, no refresh unless username/password also set):

```bash
LEAPING_ACCESS_TOKEN=eyJ...
LEAPING_AGENT_ID=550e8400-...
```

```bash
cd call-insights
cp .env.example .env
npm install
npm run report -- --days 7 --limit 100
npm run report -- --call-id 06a47740-e4de-7d7c-8000-885c352e3869
```

One-off token without editing `.env`:

```bash
LEAPING_ACCESS_TOKEN=eyJ... npm run report -- --days 7
```

## Outputs

Reports land in `call-insights/reports/`:

| File | Content |
|------|---------|
| `dkn-call-insights-*.pdf` | Clean report for stakeholders |
| `dkn-call-insights-*.md` | Same content, editable |
| `dkn-call-insights-*.json` | Machine-readable analyses |
| `calls-export-*.csv` | Leaping CSV export (metadata + fields, no full transcript) |

## CLI options

```bash
npm run report -- --days 14 --limit 60 --out ./my-reports
npm run report -- --call-id YOUR-CALL-UUID
npm run report -- --no-llm          # skip OpenAI
npm run report -- --no-csv          # skip CSV export
```

## How issue detection works (v2)

Issues are **not** scraped from raw JSON metadata (that caused 100/100 false `birthday_binding` flags).

| Signal | Example |
|--------|---------|
| Tool **error** text | `Missing field value: birthday_system` |
| **Transcript** patterns | „Einen Moment bitte“, „Meinten Sie 1956?“ |
| Leaping `detected_events` | `repeated_birthday_requests > 2` |
| Outcome flags | `verification_successful=false`, call `failed`/`dropped`, long call without verify |

Normal calls that mention `check_birthday` in metadata are **OK**.

## What it detects (rule-based)

| Category | Typical DKN symptom |
|----------|---------------------|
| `verification_loop` | *„Danke. Einen Moment bitte.“*, VNR/Geburtstag loops |
| `birthday_binding` | `Missing field value: birthday_system` |
| `phone_path` | `recognize_customer_by_phone` failed |
| `stt_noise` | Merz/März, Marie inventing *„Meinten Sie 1956?“* |
| `wrong_brain` | Wrong path (VNR after phone), missing tools, clone-only MCP |
| `escalation` | Tool errors, transfers, dropped calls |
| `customer_confusion` | Repeated *„verstehe nicht“* |

With `OPENAI_API_KEY`, the LLM adds an executive summary with **Marie / Leaping / MCP** ownership and prioritized fixes.

## Pivot thinking (why this exists)

Real DKN callers are messy: STT noise, corrections (*„Ja, aber im Merz geboren“*), method switches mid-flow. A full deterministic MCP state machine fights the call in real time.

**Better loop:**

1. **Post-call insights** (this tool) — see patterns across 50–100 calls  
2. **Leaping Dialogue + field bindings** — `birthday_system`, stages, transfer nodes  
3. **Native HTTP functions** — phone/VNR/PLZ paths in Marie  
4. **MCP clone** — only if you explicitly test `pmb_verification_*` brains

## Note on transcripts

Leaping CSV export **excludes full transcripts** (by design). Analysis uses API call records (`transcript_text` when present), function call errors, and field metadata.

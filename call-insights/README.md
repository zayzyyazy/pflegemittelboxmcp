# Call Insights (separate from MCP runtime)

Export Leaping calls → rule-based + optional LLM analysis → **PDF / Markdown / JSON** report for DKN/Marie.

This tool lives **outside** the MCP server on purpose: learn from real calls first, then fix Marie prompt, Leaping bindings, or MCP surgically.

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

**Option A — paste token** (quick test):

```bash
# call-insights/.env
LEAPING_ACCESS_TOKEN=eyJ...   # from login response or Leaping UI
LEAPING_AGENT_ID=550e8400-...
```

**Option B — username/password** (tool calls `POST /v1/login` for you):

```bash
LEAPING_API_USERNAME=you@example.com
LEAPING_API_PASSWORD=...
LEAPING_AGENT_ID=550e8400-...
```

```bash
cd call-insights
cp .env.example .env
npm install
npm run report -- --days 7 --limit 100
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
npm run report -- --days 14 --limit 200 --out ./my-reports
npm run report -- --no-llm          # skip OpenAI
npm run report -- --no-csv          # skip CSV export
```

## What it detects (rule-based)

| Category | Typical DKN symptom |
|----------|---------------------|
| `verification_loop` | *„Danke. Einen Moment bitte.“* when MCP returned empty `say` |
| `birthday_binding` | `Missing field value: birthday_system` |
| `phone_path` | Caller ID treated as customer phone |
| `stt_noise` | Merz/März, Marie inventing *„Meinten Sie 1956?“* |
| `wrong_brain` | Wrong verification path (VNR vs address vs phone) |
| `escalation` | Technical errors, transfers |
| `customer_confusion` | Repeated *„verstehe nicht“* |

With `OPENAI_API_KEY`, the LLM adds an executive summary, **Marie vs MCP** split, and prioritized fixes.

## Pivot thinking (why this exists)

Real DKN callers are messy: STT noise, corrections (*„Ja, aber im Merz geboren“*), method switches mid-flow. A full deterministic MCP state machine fights the call in real time.

**Better loop:**

1. **Post-call insights** (this tool) — see patterns across 50–100 calls  
2. **Thin MCP** — router + hints, not every STT edge case  
3. **Marie executor prompt + bindings** — minimal lines, strict `say` obedience  
4. **Surgical MCP fixes** — only for issues the data proves

## Note on transcripts

Leaping CSV export **excludes full transcripts** (by design). Analysis uses API call records (`transcript_text` when present), function call errors, and field metadata.

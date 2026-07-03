# Call Insights (separate from MCP runtime)

Export Leaping calls → rule-based + optional LLM analysis → **PDF / Markdown / JSON** report for DKN/Marie.

This tool lives **outside** the MCP server on purpose: learn from real calls first, then fix Marie prompt, Leaping bindings, or MCP surgically.

## Quick start

```bash
cd call-insights
cp .env.example .env
# Fill LEAPING_API_KEY (or username/password) + LEAPING_AGENT_ID
# Optional: OPENAI_API_KEY for executive summary

npm install
npm run report -- --days 7 --limit 100
```

Outputs land in `call-insights/reports/`:

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

## Env vars

See `.env.example`. Same Leaping auth as `server/src/post-call-monitor.ts`.

## Note on transcripts

Leaping CSV export **excludes full transcripts** (by design). Analysis uses API call records (`transcript_text` when present), function call errors, and field metadata. For deeper review, paste problem call IDs into Leaping UI or extend this tool with per-call detail fetch.

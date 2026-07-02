---
name: leaping-marie
description: >-
  Leaping AI voice agent platform and Marie (Pflegemittelbox) integration.
  Use when building, debugging, or prompting Leaping agents, MCP servers, Function
  nodes, stages, transitions, telephony, outbound, API calls, SSE chat, or Marie
  clone verification flows. Requires ingested official Leaping PDF docs in
  references/extracted/.
---

# Leaping AI + Marie

This skill is built from **your official Leaping AI doc PDF exports**, not web guesses.

If `references/extracted/` is missing or empty, tell the user to drop PDFs per
`skills/leaping-marie/source-pdfs/README.md` and run ingest before relying on
platform-specific claims.

## When to use

- Leaping Studio / agent builder, stages, transitions, Function nodes
- MCP server wiring, tool discovery (`tools/list`), field bindings
- Marie voice agent prompts (agent vs stage layers)
- Telephony, phone deployment, inbound/outbound, SMS
- Leaping REST API (login, get/export calls, SSE chat)
- Pflegemittelbox MCP brains (`pmb_verification_*`) and clone testing

## How to work

1. **Platform facts** — consult the extracted PDF for the topic (index below).
2. **Project facts** — consult `references/project-marie-mcp.md` for this repo only.
3. Do not invent Leaping UI field names, API paths, or binding syntax; cite the extracted doc.
4. When advising Marie clone fixes, prefer Function nodes + explicit MCP gates over free-form LLM tool calls.

{{DOC_INDEX}}

## Marie / Pflegemittelbox (this repo)

See `references/project-marie-mcp.md` for MCP tools, session_id bindings, and Kundenident stage executor rules derived from this codebase.

## Ingest status

Regenerate this skill after adding PDFs:

```bash
python3 scripts/ingest-leaping-pdfs.py
python3 scripts/build-leaping-marie-skill.py
```

# Leaping AI docs — drop PDFs here

The **leaping-marie** skill is built from these PDFs only (not guessed from the web).

## How to add your files

### Option A — Copy into this repo (best for Cursor Cloud Agent)

On your Mac, copy all PDFs from `~/Documents/` into this folder:

```bash
cp "/Users/zay/Documents/"*"Leaping AI docs.pdf" \
   /path/to/pflegemittelboxmcp/skills/leaping-marie/source-pdfs/
```

Then commit and push:

```bash
git add skills/leaping-marie/source-pdfs/
git commit -m "Add Leaping AI doc PDFs for skill ingestion"
git push
```

Tell the agent: **“PDFs are in source-pdfs — run ingest and build the skill.”**

### Option B — Attach in Cursor chat

Drag all 15 PDFs into the Cursor agent chat in one message. Ask the agent to save them under `skills/leaping-marie/source-pdfs/` and run ingest.

### Option C — One-shot extract on your Mac (no PDFs in git)

If you do not want PDFs in the repo, extract text locally and commit only markdown:

```bash
cd /path/to/pflegemittelboxmcp
python3 scripts/ingest-leaping-pdfs.py --source "/Users/zay/Documents"
git add skills/leaping-marie/references/extracted/
git commit -m "Ingest Leaping docs (markdown only)"
git push
```

## Expected filenames

These match your `~/Documents/` exports:

| File | Topic |
|------|--------|
| `Agent builder (Studio) - Leaping AI docs.pdf` | Studio / agent builder |
| `Calls - Leaping AI docs.pdf` | Calls UI |
| `Create phone deployment - Leaping AI docs.pdf` | Phone deployment |
| `Details - Leaping AI docs.pdf` | Agent details |
| `Home area - Leaping AI docs.pdf` | Home / dashboard |
| `MCP servers - Leaping AI docs.pdf` | MCP integration |
| `Outbound - Leaping AI docs.pdf` | Outbound campaigns |
| `Phone numbers (Telephony) - Leaping AI docs.pdf` | Telephony |
| `Prompting best practices - Leaping AI docs.pdf` | Prompting |
| `Send outbound sms - Leaping AI docs.pdf` | Outbound SMS API |
| `SSE Chat - Leaping AI docs.pdf` | SSE Chat API |
| `SSE Chat (Latest Snapshot) - Leaping AI docs.pdf` | SSE Chat snapshot |
| `Export calls - Leaping AI docs.pdf` | Export calls API |
| `Get calls - Leaping AI docs.pdf` | Get calls API |
| `Login - Leaping AI docs.pdf` | Login API |

Extra PDFs are fine — ingest will pick up any `*Leaping AI docs.pdf` in this folder.

## After drop

From repo root:

```bash
python3 scripts/ingest-leaping-pdfs.py
python3 scripts/build-leaping-marie-skill.py
```

Then install for your tools (see `skills/leaping-marie/INSTALL.md`).

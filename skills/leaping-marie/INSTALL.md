# Install leaping-marie skill (Cursor, Codex, ChatGPT)

## 1. Add your PDFs

See `source-pdfs/README.md`. Short version:

```bash
cp ~/Documents/*"Leaping AI docs.pdf" skills/leaping-marie/source-pdfs/
```

## 2. Build from PDFs

```bash
python3 scripts/ingest-leaping-pdfs.py
python3 scripts/build-leaping-marie-skill.py
```

This writes:

| Output | Use |
|--------|-----|
| `.cursor/skills/leaping-marie/SKILL.md` | Cursor Agent (auto or `/leaping-marie`) |
| `.codex/skills/leaping-marie/SKILL.md` | OpenAI Codex |
| `CHATGPT_KNOWLEDGE_PACK.md` | Single file for Custom GPT knowledge |

Extracted markdown: `references/extracted/*.md`

## 3. Cursor

Skill is already at `.cursor/skills/leaping-marie/` after build.

- Auto: agent applies when task mentions Leaping, Marie, MCP, stages, telephony
- Manual: `/leaping-marie` or `@leaping-marie`

Copy to global skills (all projects):

```bash
cp -R .cursor/skills/leaping-marie ~/.cursor/skills/
```

## 4. Codex

After build, copy to user skills:

```bash
cp -R .codex/skills/leaping-marie ~/.codex/skills/
```

Or symlink from this repo if you work here often.

## 5. ChatGPT

**Custom GPT:**

1. Create GPT → Configure → Knowledge → upload `CHATGPT_KNOWLEDGE_PACK.md`
2. Instructions (paste):

```
You help build and debug Leaping AI voice agents and Marie (Pflegemittelbox).
Use only facts from uploaded Leaping docs and the knowledge pack.
For Marie MCP verification, follow Function-node executor pattern: MCP decides say/functions/transitions; the agent does not improvise verification.
When unsure about Leaping UI or API, say so — do not guess.
```

**ChatGPT Projects:** upload the same knowledge pack + add instructions above.

## 6. Re-sync after new PDFs

Re-copy PDFs → run ingest + build → re-upload `CHATGPT_KNOWLEDGE_PACK.md` to ChatGPT.

## 7. Without PDFs in git

Extract on Mac only:

```bash
python3 scripts/ingest-leaping-pdfs.py --source "/Users/zay/Documents"
python3 scripts/build-leaping-marie-skill.py
git add skills/leaping-marie/references/extracted/ .cursor/skills/ .codex/skills/
```

Commit markdown only; keep PDFs local.

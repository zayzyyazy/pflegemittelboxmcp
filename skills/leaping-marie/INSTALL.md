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

**Committed path (works after `git pull` — no build required):**

`.agents/skills/leaping-marie/SKILL.md`

**Install / refresh:**

```bash
bash scripts/install-leaping-marie-skill.sh
# optional: all projects on your Mac
bash scripts/install-leaping-marie-skill.sh --global
```

**Find it in Cursor:**

1. **File → Open Folder** → `~/pflegemittelboxmcp` (must be the repo root, not `Documents`)
2. **Cmd+Shift+P** → `Developer: Reload Window`
3. **Customize** (left sidebar) → **Skills** → `leaping-marie`
4. Or Agent chat: type **`/leaping`** and pick `leaping-marie`

If still missing: run with `--global`, reload window, open a **new** Agent chat.

Local copies (gitignored): `.cursor/skills/leaping-marie/`

## 4. Codex

Generated locally (not in git). After build:

```bash
cp -R .codex/skills/leaping-marie ~/.codex/skills/
```

Or copy canonical source:

```bash
mkdir -p ~/.codex/skills/leaping-marie
cp skills/leaping-marie/SKILL.md ~/.codex/skills/leaping-marie/
cp -R skills/leaping-marie/references ~/.codex/skills/leaping-marie/
```

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

If `git pull` fails with “untracked working tree files would be overwritten” for `.codex/`:

```bash
rm -rf .codex/skills/leaping-marie
git pull origin cursor/leaping-marie-skill-6983
python3 scripts/build-leaping-marie-skill.py
```

`.codex/` and `.cursor/` are local build output — not committed to git.

## 7. Without PDFs in git

Extract on Mac only:

```bash
python3 scripts/ingest-leaping-pdfs.py --source "/Users/zay/Documents"
python3 scripts/build-leaping-marie-skill.py
git add skills/leaping-marie/references/extracted/ .cursor/skills/ .codex/skills/
```

Commit markdown only; keep PDFs local.

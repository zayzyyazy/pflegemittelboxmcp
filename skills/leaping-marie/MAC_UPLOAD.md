# Mac upload — when drag-and-drop only sends paths

Cursor **Cloud Agent** runs on a remote server. Dragging PDFs from your Mac often sends **only the path** (`/Users/zay/...`), not the file bytes. The agent cannot read your Mac.

## Fix: run this on your Mac (Terminal)

Copy **everything** below into Terminal and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/zayzyyazy/pflegemittelboxmcp/cursor/leaping-marie-skill-6983/scripts/mac-one-shot-skill-upload.sh | bash
```

If `curl` fails (private repo), use local clone instead:

```bash
git clone https://github.com/zayzyyazy/pflegemittelboxmcp.git ~/pflegemittelboxmcp
cd ~/pflegemittelboxmcp
git checkout cursor/leaping-marie-skill-6983
bash scripts/mac-one-shot-skill-upload.sh
```

## What it does

1. Clones repo to `~/pflegemittelboxmcp` (not Documents)
2. Copies PDFs from `~/Documents/*Leaping AI docs.pdf`
3. Extracts text → `skills/leaping-marie/references/extracted/*.md`
4. Builds skill for Cursor / Codex / ChatGPT
5. Pushes to GitHub

## Then in Cursor chat

> Skill markdown is pushed — finish the leaping-marie skill

## If git push asks for login

Use GitHub CLI or a personal access token:

```bash
gh auth login
```

Or push from **GitHub Desktop** after the script stops at push.

## Still stuck?

Zip the PDFs and attach the **.zip** file to chat (sometimes works better than individual PDFs).

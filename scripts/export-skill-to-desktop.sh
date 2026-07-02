#!/usr/bin/env bash
# Copy leaping-marie skill + handoff doc to Desktop for other apps (ChatGPT, Codex, etc.)
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$HOME/Desktop/leaping-marie-export}"
ZIP="${DEST}.zip"

echo "Exporting to: $DEST"
rm -rf "$DEST"
mkdir -p "$DEST/references" "$DEST/cursor-skill" "$DEST/codex-skill"

cp "$REPO/skills/leaping-marie/SKILL.md" "$DEST/"
cp "$REPO/skills/leaping-marie/CHATGPT_KNOWLEDGE_PACK.md" "$DEST/"
cp "$REPO/skills/leaping-marie/INSTALL.md" "$DEST/"
cp -R "$REPO/skills/leaping-marie/references/"* "$DEST/references/"
cp "$REPO/docs/NEXT-AGENT-HANDOFF.md" "$DEST/"

# Cursor / Codex folder layout (Agent Skills standard)
cp "$REPO/skills/leaping-marie/SKILL.md" "$DEST/cursor-skill/SKILL.md"
cp -R "$REPO/skills/leaping-marie/references" "$DEST/cursor-skill/"
mkdir -p "$DEST/codex-skill/leaping-marie"
cp "$REPO/skills/leaping-marie/SKILL.md" "$DEST/codex-skill/leaping-marie/SKILL.md"
cp -R "$REPO/skills/leaping-marie/references" "$DEST/codex-skill/leaping-marie/"

cat > "$DEST/README.txt" <<'EOF'
leaping-marie skill export
==========================

FOR CHATGPT Custom GPT:
  Upload: CHATGPT_KNOWLEDGE_PACK.md
  Instructions: see INSTALL.md section 5

FOR CURSOR (global):
  cp -R cursor-skill ~/.cursor/skills/leaping-marie
  OR cp -R cursor-skill ~/.agents/skills/leaping-marie

FOR CODEX:
  cp -R codex-skill/leaping-marie ~/.codex/skills/

FOR ANY LLM (paste):
  Open NEXT-AGENT-HANDOFF.md + SKILL.md as context

Repo: pflegemittelboxmcp branch cursor/leaping-marie-skill-6983
EOF

rm -f "$ZIP"
(cd "$(dirname "$DEST")" && zip -rq "$(basename "$ZIP")" "$(basename "$DEST")")

echo ""
echo "Done."
echo "  Folder: $DEST"
echo "  Zip:    $ZIP"
echo "  Open Desktop → leaping-marie-export"

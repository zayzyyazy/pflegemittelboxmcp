#!/usr/bin/env bash
# Install leaping-marie skill for Cursor (project + optional global).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/skills/leaping-marie"
NAME="leaping-marie"

if [[ ! -f "$SRC/SKILL.md" ]]; then
  echo "Missing $SRC/SKILL.md — run: python3 scripts/build-leaping-marie-skill.py"
  exit 1
fi

install_one() {
  local dest="$1"
  mkdir -p "$dest"
  cp "$SRC/SKILL.md" "$dest/SKILL.md"
  rm -rf "$dest/references"
  cp -R "$SRC/references" "$dest/references"
  echo "  → $dest"
}

echo "Project install (.agents/skills — Cursor auto-discovers):"
install_one "$REPO/.agents/skills/$NAME"

echo "Project install (.cursor/skills — local):"
install_one "$REPO/.cursor/skills/$NAME"

if [[ "${1:-}" == "--global" ]]; then
  echo "Global install (all Cursor projects):"
  install_one "$HOME/.agents/skills/$NAME"
  install_one "$HOME/.cursor/skills/$NAME"
fi

echo ""
echo "Next:"
echo "  1. In Cursor: File → Open Folder → $REPO"
echo "  2. Developer: Reload Window (Cmd+Shift+P)"
echo "  3. Customize → Skills → look for 'leaping-marie'"
echo "  4. Or in Agent chat type: /leaping-marie"

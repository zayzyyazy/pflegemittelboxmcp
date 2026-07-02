#!/usr/bin/env bash
# Run on your Mac (where ~/Documents has the Leaping PDFs).
# Copies PDFs into the repo and optionally ingests + builds the skill.
#
# Usage:
#   cd /path/to/pflegemittelboxmcp
#   ./scripts/sync-leaping-pdfs-from-mac.sh
#   ./scripts/sync-leaping-pdfs-from-mac.sh --ingest --push

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/skills/leaping-marie/source-pdfs"
SOURCE="${LEAPING_DOCS_SOURCE:-$HOME/Documents}"

mkdir -p "$DEST"
count=0
shopt -s nullglob
for f in "$SOURCE"/*"Leaping AI docs.pdf"; do
  cp -f "$f" "$DEST/"
  echo "  copied: $(basename "$f")"
  count=$((count + 1))
done

if [[ "$count" -eq 0 ]]; then
  echo "No PDFs found in: $SOURCE"
  echo 'Expected names like: MCP servers - Leaping AI docs.pdf'
  exit 1
fi

echo "Copied $count PDF(s) to skills/leaping-marie/source-pdfs/"

if [[ "${1:-}" == "--ingest" ]] || [[ "${2:-}" == "--ingest" ]]; then
  PYTHON="$(bash "$REPO_ROOT/scripts/ensure-pdf-python.sh")"
  "$PYTHON" "$REPO_ROOT/scripts/ingest-leaping-pdfs.py"
  "$PYTHON" "$REPO_ROOT/scripts/build-leaping-marie-skill.py"
fi

if [[ "${1:-}" == "--push" ]] || [[ "${2:-}" == "--push" ]] || [[ "${3:-}" == "--push" ]]; then
  cd "$REPO_ROOT"
  git add skills/leaping-marie/source-pdfs/
  git add skills/leaping-marie/references/extracted/ 2>/dev/null || true
  git add skills/leaping-marie/CHATGPT_KNOWLEDGE_PACK.md 2>/dev/null || true
  git commit -m "Add/sync Leaping AI doc PDFs and ingested skill" || true
  git push
  echo "Pushed. Tell the cloud agent: PDFs are in the repo — verify skill."
fi

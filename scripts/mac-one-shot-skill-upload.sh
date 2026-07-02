#!/usr/bin/env bash
# Run this ENTIRE block on your Mac in Terminal (copy-paste all lines).
# It clones the repo, copies PDFs from Documents, builds skill markdown, pushes to GitHub.
#
# After it finishes, tell the Cursor cloud agent:
#   "Skill markdown is pushed — finish the leaping-marie skill"

set -euo pipefail

REPO="$HOME/pflegemittelboxmcp"
BRANCH="cursor/leaping-marie-skill-6983"
DOCS="$HOME/Documents"

echo "=== 1/6 Clone or update repo ==="
if [[ -d "$REPO/.git" ]]; then
  cd "$REPO"
  git fetch origin
  git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
  git pull origin "$BRANCH" || true
else
  git clone https://github.com/zayzyyazy/pflegemittelboxmcp.git "$REPO"
  cd "$REPO"
  git checkout "$BRANCH"
fi

echo "=== 2/6 Copy PDFs from Documents ==="
DEST="$REPO/skills/leaping-marie/source-pdfs"
mkdir -p "$DEST"
count=0
for f in "$DOCS"/*"Leaping AI docs.pdf"; do
  [[ -f "$f" ]] || continue
  cp -f "$f" "$DEST/"
  echo "  $(basename "$f")"
  count=$((count + 1))
done
if [[ "$count" -eq 0 ]]; then
  echo "ERROR: No PDFs in $DOCS"
  echo "Check that files end with: Leaping AI docs.pdf"
  exit 1
fi
echo "Copied $count PDF(s)"

echo "=== 3/6 Install pypdf (if needed) ==="
python3 -m pip install --user pypdf -q

echo "=== 4/6 Extract PDF text to markdown ==="
python3 "$REPO/scripts/ingest-leaping-pdfs.py"
python3 "$REPO/scripts/build-leaping-marie-skill.py"

echo "=== 5/6 Commit (markdown + PDFs) ==="
git add skills/leaping-marie/
git status --short
git commit -m "Ingest Leaping AI PDFs for leaping-marie skill" || echo "Nothing new to commit"

echo "=== 6/6 Push to GitHub ==="
git push -u origin "$BRANCH"

echo ""
echo "DONE. Go back to Cursor and write:"
echo "  Skill markdown is pushed — finish the leaping-marie skill"

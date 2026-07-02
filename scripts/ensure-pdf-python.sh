#!/usr/bin/env bash
# Creates a local venv with pypdf (Mac/Homebrew safe). Prints python path to stdout.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$REPO_ROOT/.venv-pdf-ingest"

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q pypdf

echo "$VENV/bin/python3"

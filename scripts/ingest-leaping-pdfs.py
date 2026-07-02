#!/usr/bin/env python3
"""
Extract text from Leaping AI doc PDFs into markdown for the leaping-marie skill.

Usage:
  python3 scripts/ingest-leaping-pdfs.py
  python3 scripts/ingest-leaping-pdfs.py --source /Users/zay/Documents
  python3 scripts/ingest-leaping-pdfs.py --source skills/leaping-marie/source-pdfs
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Missing pypdf. Run: pip install pypdf", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPO_ROOT / "skills" / "leaping-marie" / "source-pdfs"
OUTPUT_DIR = REPO_ROOT / "skills" / "leaping-marie" / "references" / "extracted"
MANIFEST_PATH = OUTPUT_DIR / "MANIFEST.json"


def slugify(name: str) -> str:
    base = Path(name).stem
    base = re.sub(r"\s*-\s*Leaping AI docs$", "", base, flags=re.I)
    base = base.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    return base.strip("-") or "doc"


def extract_pdf(pdf_path: Path) -> tuple[str, int]:
    reader = PdfReader(str(pdf_path))
    pages: list[str] = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"## Page {i}\n\n{text.strip()}\n")
    return "\n".join(pages), len(reader.pages)


def find_pdfs(source: Path) -> list[Path]:
    if not source.exists():
        return []
    patterns = ["*Leaping AI docs.pdf", "*.pdf"]
    found: dict[str, Path] = {}
    for pattern in patterns:
        for path in sorted(source.glob(pattern)):
            if path.is_file():
                found[path.name] = path
    return list(found.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Leaping AI PDFs to markdown")
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Folder with PDFs (default: {DEFAULT_SOURCE})",
    )
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    pdfs = find_pdfs(source)
    if not pdfs:
        print(f"No PDFs found in {source}", file=sys.stderr)
        print("Drop files per skills/leaping-marie/source-pdfs/README.md", file=sys.stderr)
        return 1

    manifest_entries = []
    for pdf in pdfs:
        slug = slugify(pdf.name)
        out_path = OUTPUT_DIR / f"{slug}.md"
        body, page_count = extract_pdf(pdf)
        title = Path(pdf.name).stem.replace(" - Leaping AI docs", "")
        md = (
            f"# {title}\n\n"
            f"<!-- source: {pdf.name} | pages: {page_count} | auto-extracted -->\n\n"
            f"{body}\n"
        )
        out_path.write_text(md, encoding="utf-8")
        manifest_entries.append(
            {
                "source_pdf": pdf.name,
                "slug": slug,
                "markdown": str(out_path.relative_to(REPO_ROOT)),
                "pages": page_count,
                "chars": len(body),
            }
        )
        print(f"  ✓ {pdf.name} → {out_path.relative_to(REPO_ROOT)} ({page_count} pages)")

    import json

    MANIFEST_PATH.write_text(
        json.dumps({"source_dir": str(source), "documents": manifest_entries}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote {len(manifest_entries)} docs to {OUTPUT_DIR.relative_to(REPO_ROOT)}/")
    print("Next: python3 scripts/build-leaping-marie-skill.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

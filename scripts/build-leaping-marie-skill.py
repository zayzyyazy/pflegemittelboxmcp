#!/usr/bin/env python3
"""
Build leaping-marie SKILL.md from ingested PDF markdown.

Requires: skills/leaping-marie/references/extracted/*.md (run ingest-leaping-pdfs.py first)
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXTRACTED = REPO_ROOT / "skills" / "leaping-marie" / "references" / "extracted"
MANIFEST = EXTRACTED / "MANIFEST.json"
SKILL_TEMPLATE = REPO_ROOT / "skills" / "leaping-marie" / "SKILL.template.md"
CURSOR_SKILL = REPO_ROOT / ".cursor" / "skills" / "leaping-marie" / "SKILL.md"
CODEX_SKILL = REPO_ROOT / ".codex" / "skills" / "leaping-marie" / "SKILL.md"
CHATGPT_PACK = REPO_ROOT / "skills" / "leaping-marie" / "CHATGPT_KNOWLEDGE_PACK.md"


def main() -> int:
    if not MANIFEST.exists():
        print("No ingested docs. Run: python3 scripts/ingest-leaping-pdfs.py", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    docs = manifest.get("documents", [])
    if not docs:
        print("MANIFEST.json is empty.", file=sys.stderr)
        return 1

    doc_index_lines = ["## Official Leaping docs (from your PDFs)\n"]
    for entry in docs:
        slug = entry["slug"]
        title = entry["source_pdf"].replace(" - Leaping AI docs.pdf", "")
        doc_index_lines.append(
            f"- **{title}** — read `references/extracted/{slug}.md` when working on that area"
        )

    template = SKILL_TEMPLATE.read_text(encoding="utf-8")
    skill_body = template.replace("{{DOC_INDEX}}", "\n".join(doc_index_lines))

    CURSOR_SKILL.parent.mkdir(parents=True, exist_ok=True)
    CODEX_SKILL.parent.mkdir(parents=True, exist_ok=True)
    CURSOR_SKILL.write_text(skill_body, encoding="utf-8")
    CODEX_SKILL.write_text(skill_body, encoding="utf-8")

    refs_cursor = CURSOR_SKILL.parent / "references" / "extracted"
    refs_codex = CODEX_SKILL.parent / "references" / "extracted"
    for target in (refs_cursor, refs_codex):
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(EXTRACTED, target)

    pack_parts = [
        "# Leaping AI + Marie — knowledge pack\n",
        "<!-- Generated from official Leaping PDF exports. Upload this file to ChatGPT Custom GPT knowledge. -->\n",
    ]
    for entry in sorted(docs, key=lambda d: d["slug"]):
        md_path = REPO_ROOT / entry["markdown"]
        if md_path.exists():
            pack_parts.append(f"\n---\n\n{md_path.read_text(encoding='utf-8')}\n")
    CHATGPT_PACK.write_text("".join(pack_parts), encoding="utf-8")

    print(f"Built {CURSOR_SKILL.relative_to(REPO_ROOT)}")
    print(f"Built {CODEX_SKILL.relative_to(REPO_ROOT)}")
    print(f"Built {CHATGPT_PACK.relative_to(REPO_ROOT)} ({len(docs)} docs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

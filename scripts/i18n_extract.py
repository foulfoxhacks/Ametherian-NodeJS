#!/usr/bin/env python3
"""List translatable segments of the built English site and report catalog coverage.

    python scripts/i18n_extract.py            # coverage per language
    python scripts/i18n_extract.py --write    # also write i18n/source.json (all segments, ordered)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sitegen import i18n  # noqa: E402
from sitegen.common import ROOT, ROUTES  # noqa: E402


def segments() -> list[str]:
    seen, ordered = set(), []
    for path, route in ROUTES.items():
        if path == "404.html":
            continue
        page = ROOT / (route.lstrip("/") + "index.html")
        for seg in i18n.extract(page.read_text(encoding="utf-8")):
            if seg not in seen:
                seen.add(seg)
                ordered.append(seg)
    return ordered


def main() -> None:
    segs = segments()
    if "--write" in sys.argv:
        (ROOT / "i18n").mkdir(exist_ok=True)
        (ROOT / "i18n" / "source.json").write_text(json.dumps(segs, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for l in i18n.LOCALES:
        table = i18n.catalog(l["code"])
        done = sum(1 for s in segs if s in table)
        print(f"{l['code']:6} {done}/{len(segs)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Import a translation file into i18n/<code>.json.

    python scripts/i18n_import.py <code> <lines.txt>

<lines.txt> has exactly one line per entry of i18n/source.json, in the same
order. Existing translations for segments that are no longer in source.json
are dropped; the result is keyed by the English segment, so later reordering
of the site cannot misalign translations.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    code, path = sys.argv[1], Path(sys.argv[2])
    source = json.loads((ROOT / "i18n" / "source.json").read_text(encoding="utf-8"))
    lines = [l.rstrip("\r\n") for l in path.read_text(encoding="utf-8").splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    if len(lines) != len(source):
        sys.exit(f"{path}: {len(lines)} lines, expected {len(source)}")
    # Optional "N|text" numbering: verified, then stripped.
    if all("|" in l and l.split("|", 1)[0].strip().isdigit() for l in lines):
        numbers = [int(l.split("|", 1)[0]) for l in lines]
        bad = [i + 1 for i, n in enumerate(numbers) if n != i + 1]
        if bad:
            sys.exit(f"{path}: numbering out of sequence at line(s) {bad[:10]}")
        lines = [l.split("|", 1)[1] for l in lines]
    empty = [i for i, l in enumerate(lines) if not l.strip()]
    if empty:
        sys.exit(f"{path}: empty translation on line(s) {[i + 1 for i in empty][:10]}")
    target = ROOT / "i18n" / f"{code}.json"
    table = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else {}
    table.update(dict(zip(source, (l.strip() for l in lines))))
    table = {k: v for k, v in table.items() if k in set(source)}
    target.write_text(json.dumps(table, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"i18n/{code}.json: {len(table)} segments")


if __name__ == "__main__":
    main()

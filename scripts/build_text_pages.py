#!/usr/bin/env python3
"""Build the styled llms.html and robots.html companions (also run by build_site.py).

The raw llms.txt and robots.txt files are never modified here.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sitegen.common import ROOT  # noqa: E402
from sitegen.companions import build  # noqa: E402
from sitegen import i18n  # noqa: E402


def main() -> None:
    for name, source in build().items():
        (ROOT / name).write_bytes(i18n.decorate(source, "/", i18n.DEFAULT).replace("<!--HREFLANG-->", "").encode("utf-8"))
    print("Built styled llms.html and robots.html companions; raw TXT files unchanged.")


if __name__ == "__main__":
    main()

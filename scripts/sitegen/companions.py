"""Styled, human-readable companions for the raw llms.txt and robots.txt files.

They use the full site header and footer. The raw TXT files stay untouched for
automated tools; these pages are English-only mirrors of those files.
"""

from __future__ import annotations

import html
import json
import re

from .common import BASE, ROOT, site_footer, site_header


def _inline(value: str) -> str:
    value = html.escape(value, quote=True)
    value = re.sub(r"`([^`]+)`", r"<code>\1</code>", value)
    value = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', value)
    return value


def markdown_body(source: str) -> str:
    blocks, paragraph, items = [], [], []

    def flush():
        if paragraph:
            blocks.append("<p>" + " ".join(_inline(x) for x in paragraph) + "</p>")
            paragraph.clear()
        if items:
            blocks.append("<ul>" + "".join(f"<li>{_inline(x)}</li>" for x in items) + "</ul>")
            items.clear()

    for raw in source.splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif line.startswith("# "):
            flush()
            blocks.append(f"<h2>{_inline(line[2:])}</h2>")
        elif line.startswith("## "):
            flush()
            blocks.append(f"<h3>{_inline(line[3:])}</h3>")
        elif line.startswith("> "):
            flush()
            blocks.append(f"<blockquote>{_inline(line[2:])}</blockquote>")
        elif line.startswith("- "):
            if paragraph:
                flush()
            items.append(line[2:])
        else:
            if items:
                flush()
            paragraph.append(line)
    flush()
    return "\n".join(blocks)


def robots_body(source: str) -> str:
    rows = []
    for line in source.splitlines():
        value = line.strip()
        if not value:
            continue
        if value.startswith("#"):
            rows.append(f'<p class="robots-comment">{html.escape(value[1:].strip())}</p>')
        elif ":" in value:
            key, val = value.split(":", 1)
            rows.append(f'<div class="robots-row"><span>{html.escape(key.strip())}</span><code>{html.escape(val.strip())}</code></div>')
        else:
            rows.append(f"<p>{html.escape(value)}</p>")
    return (
        '<section class="robots-directives" aria-label="Crawler directives">' + "".join(rows) + "</section>"
        f'<details class="robots-raw"><summary>View exact plain-text file</summary><pre>{html.escape(source)}</pre></details>'
    )


def page(name: str, title: str, description: str, eyebrow: str, body: str, raw_url: str) -> str:
    url = f"{BASE}/{name}"
    ld = json.dumps({"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": url, "inLanguage": "en"})
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} — Ametherian</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<meta name="robots" content="index,follow">
<meta name="author" content="FoulFoxHacks">
<meta name="publisher" content="FoulFoxHacks">
<meta name="theme-color" content="#0b0812" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f7f4fc" media="(prefers-color-scheme: light)">
<meta name="color-scheme" content="dark light">
<script>(function(){{try{{var m=localStorage.getItem("ametherian-theme"),t=m;if(t!=="light"&&t!=="dark"){{m="system";t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}}document.documentElement.dataset.theme=t;document.documentElement.dataset.themeMode=m;}}catch(e){{document.documentElement.dataset.theme="dark";}}}})();</script>
<link rel="canonical" href="{url}">
<link rel="icon" href="/assets/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ametherian">
<meta property="og:title" content="{html.escape(title)} — Ametherian">
<meta property="og:description" content="{html.escape(description, quote=True)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/assets/og/home.png">
<meta property="og:image:alt" content="Ametherian resource document">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/assets/text-docs.css">
<script type="application/ld+json">{ld}</script>
</head>
<body class="page-home">
<a class="skip-link" href="#main">Skip to content</a>
{site_header(name, "")}
<main id="main" class="text-doc-main"><div class="text-doc-shell">
<p class="eyebrow">Ametherian · {html.escape(eyebrow)}</p><h1>{html.escape(title)}</h1>
<p class="text-doc-lead">{html.escape(description)}</p>
<div class="text-doc-toolbar"><span class="text-doc-format">Styled HTML presentation</span><a class="button button--ghost" href="/{raw_url}">Open original {html.escape(raw_url)}</a></div>
<article class="text-doc-content" translate="no">{body}</article>
<p class="text-doc-note">This is a readable presentation. The original <code>/{html.escape(raw_url)}</code> stays the plain-text resource for automated tools.</p>
</div></main>
{site_footer(name)}
<script src="/assets/site.js" defer></script>
</body>
</html>
"""


def build() -> dict[str, str]:
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    return {
        "llms.html": page("llms.html", "llms.txt", "A readable, styled view of Ametherian's AI and developer context file.", "AI discovery resource", markdown_body(llms), "llms.txt"),
        "robots.html": page("robots.html", "robots.txt", "A readable view of the crawler access rules published by Ametherian.", "Crawler guidance", robots_body(robots), "robots.txt"),
    }

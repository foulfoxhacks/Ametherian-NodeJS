#!/usr/bin/env python3
"""Build styled browser companions for the raw llms.txt and robots.txt files."""
from __future__ import annotations
import html, json, re, shutil
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ametherian.foulfoxhacks.dev"

def inline_markdown(value: str) -> str:
    value = html.escape(value, quote=True)
    value = re.sub(r"\`([^\`]+)\`", r"<code>\1</code>", value)
    value = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', value)
    return value

def markdown_body(source: str) -> str:
    blocks, paragraph, items = [], [], []
    def flush_p():
        if paragraph:
            blocks.append("<p>" + " ".join(inline_markdown(x) for x in paragraph) + "</p>")
            paragraph.clear()
    def flush_l():
        if items:
            blocks.append("<ul>" + "".join(f"<li>{inline_markdown(x)}</li>" for x in items) + "</ul>")
            items.clear()
    for raw in source.splitlines():
        line = raw.strip()
        if not line:
            flush_p(); flush_l()
        elif line.startswith("# "):
            flush_p(); flush_l(); blocks.append(f"<h2>{inline_markdown(line[2:])}</h2>")
        elif line.startswith("## "):
            flush_p(); flush_l(); blocks.append(f"<h3>{inline_markdown(line[3:])}</h3>")
        elif line.startswith("> "):
            flush_p(); flush_l(); blocks.append(f"<blockquote>{inline_markdown(line[2:])}</blockquote>")
        elif line.startswith("- "):
            flush_p(); items.append(line[2:])
        else:
            flush_l(); paragraph.append(line)
    flush_p(); flush_l()
    return "\n".join(blocks)

def page(title: str, description: str, eyebrow: str, body: str, raw_url: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="theme-color" content="#0b0812">
<title>{html.escape(title)} — Ametherian</title>
<meta name="description" content="{html.escape(description, quote=True)}">
<meta name="robots" content="index,follow">\n<meta name="author" content="FoulFoxHacks"><meta name="publisher" content="FoulFoxHacks">\n<meta property="og:title" content="{html.escape(title)} — Ametherian"><meta property="og:description" content="{html.escape(description, quote=True)}"><meta property="og:image" content="/assets/og/home.png"><meta property="og:image:alt" content="Ametherian resource document"><meta name="twitter:card" content="summary_large_image">\n<script type="application/ld+json">{{"@context":"https://schema.org","@type":"WebPage","name":{json.dumps(title)},"url":{json.dumps(BASE + "/" + raw_url.replace(".txt", ".html"))}}}</script>
<link rel="canonical" href="{BASE}/{raw_url.replace('.txt', '.html')}">
<link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/text-docs.css">
</head><body class="page-home">
<a class="skip-link" href="#main">Skip to content</a>
<header class="text-doc-header"><a class="text-doc-brand" href="/">Ametherian</a>
<nav aria-label="Resource navigation"><a href="/sitemap/">Visual sitemap</a><a href="/llms.html">llms.txt view</a><a href="/robots.html">robots.txt view</a></nav></header>
<main id="main" class="text-doc-main"><div class="text-doc-shell">
<p class="eyebrow">Ametherian · {eyebrow}</p><h1>{html.escape(title)}</h1>
<p class="text-doc-lead">{html.escape(description)}</p>
<div class="text-doc-toolbar"><span class="text-doc-format">Styled HTML presentation</span><a class="button button--ghost" href="/{raw_url}">Open original {html.escape(raw_url)}</a></div>
<article class="text-doc-content">{body}</article>
<p class="text-doc-note">This is a human-friendly presentation. The original <code>/{html.escape(raw_url)}</code> endpoint remains the plain-text resource for automated tools.</p>
</div></main>
<footer class="text-doc-footer"><a href="/">Ametherian home</a><a href="/sitemap/">Site sitemap</a><a href="/llms.txt">llms.txt</a><a href="/robots.txt">robots.txt</a></footer>
</body></html>
"""

def robots_body(source: str) -> str:
    rows = []
    for line in source.splitlines():
        value = line.strip()
        if not value: continue
        if value.startswith("#"):
            rows.append(f'<p class="robots-comment">{html.escape(value[1:].strip())}</p>')
        elif ":" in value:
            key, val = value.split(":", 1)
            rows.append(f'<div class="robots-row"><span>{html.escape(key.strip())}</span><code>{html.escape(val.strip())}</code></div>')
        else: rows.append(f"<p>{html.escape(value)}</p>")
    return '<section class="robots-directives" aria-label="Crawler directives">' + "".join(rows) + "</section>" + f'<details class="robots-raw"><summary>View exact plain-text file</summary><pre>{html.escape(source)}</pre></details>'

def remove_obsolete_resource_directory() -> None:
    old = ROOT / "llms"
    if old.exists(): shutil.rmtree(old)
    for file in ROOT.rglob("*.html"):
        if ".git" in file.parts: continue
        source = file.read_text(encoding="utf-8")
        source = re.sub(r'<a href="/llms/">Resources</a>\s*', "", source)
        source = re.sub(r'<a href="/llms/">AI resource directory</a>\s*', "", source)
        file.write_text(source, encoding="utf-8")
    sitemap = ROOT / "sitemap.xml"
    if sitemap.exists():
        source = sitemap.read_text(encoding="utf-8")
        source = re.sub(r"\s*<url><loc>" + re.escape(BASE) + r"/llms/</loc><lastmod>[^<]*</lastmod></url>", "", source)
        stamp = date.today().isoformat()
        for location in (BASE + "/llms.html", BASE + "/robots.html"):
            if location not in source:
                entry = f"  <url><loc>{location}</loc><lastmod>{stamp}</lastmod></url>\n"
                source = source.replace("</urlset>", entry + "</urlset>")
        sitemap.write_text(source, encoding="utf-8")
    search = ROOT / "assets/search-index.js"
    if search.exists():
        source = search.read_text(encoding="utf-8")
        match = re.search(r"window\.AMETHERIAN_SEARCH = (.*);\s*$", source, re.S)
        if match:
            entries = [x for x in json.loads(match.group(1)) if x.get("path") != "/llms/"]
            search.write_text("/* Generated by scripts/build_site.py. */\nwindow.AMETHERIAN_SEARCH = " + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    config = ROOT / "site.config.json"
    if config.exists():
        data = json.loads(config.read_text(encoding="utf-8"))
        data["pages"] = [x for x in data.get("pages", []) if x.get("path") != "/llms/"]
        config.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def main() -> None:
    llms = (ROOT / "llms.txt").read_text(encoding="utf-8")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    (ROOT / "llms.html").write_text(page("llms.txt", "A readable, styled view of Ametherian's AI and developer context file.", "AI discovery resource", markdown_body(llms), "llms.txt"), encoding="utf-8")
    (ROOT / "robots.html").write_text(page("robots.txt", "A readable view of the crawler access rules published by Ametherian.", "Crawler guidance", robots_body(robots), "robots.txt"), encoding="utf-8")
    remove_obsolete_resource_directory()
    print("Built styled llms.html and robots.html companions; preserved raw TXT files.")

if __name__ == "__main__": main()

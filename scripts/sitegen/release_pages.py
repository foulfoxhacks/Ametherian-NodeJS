"""Pages generated from the repository itself, so the site cannot drift from the code.

- /modules/   reads packages/*/package.json, test files, the vulnerability
              baseline and NODE_SECURITY_MINIMUMS.
- /changelog/ renders CHANGELOG.md and lists every package version.
"""

from __future__ import annotations

import html
import json
import re

from .common import REPO, ROOT, docs_shell, esc

# One-line purpose per package, written for readers (package.json descriptions are terse).
PURPOSE = {
    "ametherian-core": "Shared contracts: typed errors, deadlines and cancellation, resource limits, redaction, config validation, lifecycle, event hooks, runtime and integrity checks.",
    "ametherian-guard": "Outbound destination policy: blocks SSRF to private, loopback and metadata addresses, checked again on every redirect and at DNS time.",
    "ametherian-schema": "Validation and bounded parsing of untrusted input, safe against prototype pollution.",
    "ametherian-cache": "Bounded LRU/TTL cache with load de-duplication and collision-free scopes.",
    "ametherian-resilience": "Retries with backoff, concurrency and rate limits, circuit breaker.",
    "ametherian-observability": "Structured logging with redaction by default, bounded metrics, diagnostics_channel bridge.",
    "ametherian-http": "HTTP client and undici-style fetch(): guarded destinations, bounded bodies, deadlines, proxy, HTTP/2, hardened against published axios/undici vulnerability classes.",
    "ametherian-testing": "Mock transport, test server, fake clock and an adversarial fuzz corpus.",
    "ametherian-security": "Vulnerability intelligence: OSV, NIST NVD and CISA KEV clients with provenance, lockfile audit that flags actively exploited CVEs, Node.js release checks.",
    "ametherian": "Umbrella package re-exporting the others as namespaces.",
}
ORDER = list(PURPOSE)


def _count_tests(folder) -> int:
    total = 0
    for f in sorted((folder / "test").glob("*.test.js")):
        # Counts test() definitions; loops that generate several cases count once.
        total += len(re.findall(r"^\s*test\(", f.read_text(encoding="utf-8"), flags=re.M))
    return total


def packages() -> list[dict]:
    rows = []
    for folder in sorted((ROOT / "packages").iterdir()):
        manifest = folder / "package.json"
        if not manifest.is_file():
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        short = data["name"].split("/")[-1]
        rows.append(
            {
                "name": data["name"],
                "short": short,
                "folder": folder.name,
                "version": data.get("version", "0.0.0"),
                "deps": sorted(d.split("/")[-1].replace("ametherian-", "") for d in data.get("dependencies", {})),
                "tests": _count_tests(folder),
                "purpose": PURPOSE.get(short, data.get("description", "")),
            }
        )
    rows.sort(key=lambda r: ORDER.index(r["short"]) if r["short"] in ORDER else 99)
    return rows


def node_minimums() -> dict[str, str]:
    source = (ROOT / "packages/core/src/integrity.js").read_text(encoding="utf-8")
    match = re.search(r"NODE_SECURITY_MINIMUMS = Object\.freeze\(\{([^}]*)\}\)", source)
    return dict(re.findall(r"(\d+):\s*'([\d.]+)'", match.group(1))) if match else {}


def baseline_counts() -> dict:
    path = ROOT / "docs/vulnerability-baseline.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"total": data["counts"]["total"], "prevented": data["counts"].get("prevented", 0), "na": data["counts"].get("not-applicable", 0), "packages": data.get("packages", [])}


def modules_page() -> str:
    current = "modules/index.html"
    rows = packages()
    total_tests = sum(r["tests"] for r in rows)
    base = baseline_counts()
    mins = node_minimums()
    cards = []
    for r in rows:
        deps = ", ".join(r["deps"]) if r["deps"] else "—"
        cards.append(
            f"""<article class="module-card">
  <div class="module-card__top"><h3 id="{esc(r['short'])}"><code>{esc(r['name'])}</code></h3><span class="module-badge"><span translate="no">v{esc(r['version'])}</span> · preview</span></div>
  <p>{esc(r['purpose'])}</p>
  <dl class="module-facts"><div><dt>Tests</dt><dd>{r['tests']}</dd></div><div><dt>Depends on</dt><dd translate="no">{esc(deps)}</dd></div><div><dt>Source</dt><dd translate="no"><a href="{REPO}/tree/main/packages/{esc(r['folder'])}" target="_blank" rel="noopener noreferrer">packages/{esc(r['folder'])} <span aria-hidden="true">↗</span></a></dd></div></dl>
</article>"""
        )
    node_rows = "".join(f'<li><span translate="no">Node.js {esc(k)}: {esc(v)}</span> <span>or later</span></li>' for k, v in sorted(mins.items(), key=lambda kv: int(kv[0])))
    vuln = ""
    if base:
        vuln = f"""<h2 id="vulnerability-model">Vulnerability model</h2>
<p>Every published advisory for {esc(' and '.join(base['packages']))} is mapped: <strong>{base['total']}</strong> in total, <strong>{base['prevented']}</strong> prevented, each with a regression test named after the advisory, and <strong>{base['na']}</strong> not applicable, each with the reason recorded. A daily workflow checks OSV, the GitHub Advisory Database and NIST NVD for new ones.</p>
<p><a href="{REPO}/blob/main/docs/vulnerability-model.md" target="_blank" rel="noopener noreferrer">Read the vulnerability model <span aria-hidden="true">↗</span></a></p>"""
    body = f"""
<div class="module-summary" role="list">
  <div role="listitem"><strong>{len(rows)}</strong><span>packages</span></div>
  <div role="listitem"><strong>{total_tests}</strong><span>test definitions</span></div>
  <div role="listitem"><strong>0</strong><span>third-party runtime dependencies</span></div>
</div>
<p>These packages exist in the repository and pass their tests in CI. They are <strong>previews</strong>: not published to npm, not audited, and their APIs may still change. They are licensed under Apache 2.0.</p>

<h2 id="packages">Packages</h2>
<div class="module-grid">
{''.join(cards)}
</div>

{vuln}

<h2 id="runtime">Supported runtimes</h2>
<p>The minimum for each line is its latest Node.js security release. The advisory watch fails when a newer security release ships or a line reaches end of life.</p>
<ul>{node_rows}</ul>
<p>Node.js 20 is not supported: it reached end of life on 30 April 2026.</p>

<h2 id="status">What preview means</h2>
<ul>
<li>Code, tests, type declarations and threat models are public in the repository.</li>
<li>Nothing is published to npm until a release process is agreed.</li>
<li>No independent security audit has been performed.</li>
</ul>
"""
    return docs_shell(current, "Modules", "Ten preview packages, tested and unpublished.", body)


def _inline(text: str) -> str:
    text = html.escape(text, quote=True)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', text)
    return text


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"


def markdown(source: str, *, skip_title: bool = True) -> str:
    out, items, para = [], [], []

    def flush():
        if para:
            out.append("<p>" + " ".join(_inline(x) for x in para) + "</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{_inline(x)}</li>" for x in items) + "</ul>")
            items.clear()

    for raw in source.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush()
        elif line.startswith("# "):
            flush()
            if not skip_title:
                out.append(f"<h2>{_inline(line[2:])}</h2>")
        elif line.startswith("## "):
            flush()
            out.append(f'<h2 id="{_slug(line[3:])}">{_inline(line[3:])}</h2>')
        elif line.startswith("### "):
            flush()
            out.append(f'<h3 id="{_slug(line[4:])}">{_inline(line[4:])}</h3>')
        elif re.match(r"^\s*- ", line):
            if para:
                flush()
            items.append(line.strip()[2:])
        elif items and line.startswith("  "):
            items[-1] += " " + line.strip()
        else:
            if items:
                flush()
            para.append(line.strip())
    flush()
    return "\n".join(out)


def changelog_page() -> str:
    current = "changelog/index.html"
    source = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    versions = "".join(
        f"<li><code>{esc(r['name'])}</code> {esc(r['version'])}</li>" for r in packages()
    )
    body = f"""
<p>Every push to <code>main</code> that passes CI is published as a numbered preview build on <a href="{REPO}/releases" target="_blank" rel="noopener noreferrer">GitHub Releases <span aria-hidden="true">↗</span></a>, with these notes and per-package tarballs. Versions follow <a href="https://semver.org/" target="_blank" rel="noopener noreferrer">Semantic Versioning <span aria-hidden="true">↗</span></a>. Build numbers are added as <code>-build.N</code> pre-release tags.</p>
<h2 id="current-versions">Current package versions</h2>
<ul translate="no">{versions}</ul>
<h2 id="release-notes">Release notes</h2>
<p>Release notes are kept in English so they match the tagged builds exactly.</p>
<div class="changelog-body" translate="no" lang="en">
{markdown(source)}
</div>
"""
    return docs_shell(current, "Changelog", "Versions, builds, and release notes.", body)

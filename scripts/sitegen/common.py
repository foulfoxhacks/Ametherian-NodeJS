#!/usr/bin/env python3
"""Shared shell, metadata, navigation, and helpers for the static site."""

from __future__ import annotations

import html
import json
import posixpath
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://ametherian.foulfoxhacks.dev"
REPO = "https://github.com/foulfoxhacks/Ametherian-NodeJS"
FOULFOX = "https://github.com/foulfoxhacks"
TODAY = date.today().isoformat()
YEAR = 2026

PAGES = {
    "index.html": {
        "title": "Ametherian — A new kind of Node library ecosystem",
        "description": (
            "Ametherian is an independent Node.js library ecosystem: focused "
            "JavaScript and TypeScript packages, shared contracts, and "
            "security-conscious engineering."
        ),
        "og_title": "A new kind of Node library ecosystem",
        "og_subtitle": (
            "An independent ecosystem for modular JavaScript and TypeScript "
            "infrastructure."
        ),
        "og_label": "ECOSYSTEM",
        "og_key": "home",
        "og_alt": (
            "Ametherian symbol and the title A new kind of Node library "
            "ecosystem on a dark purple card."
        ),
        "body_class": "page-home",
        "nav": "home",
        "kind": "website",
        "schema": "website",
    },
    "docs/index.html": {
        "title": "Documentation — Ametherian",
        "description": (
            "Read the Ametherian documentation: project vision, package map, "
            "architecture direction, security approach, and roadmap."
        ),
        "og_title": "Documentation",
        "og_subtitle": (
            "Vision, package map, architecture, security, and roadmap."
        ),
        "og_label": "DOCUMENTATION",
        "og_key": "docs",
        "og_alt": "Ametherian documentation hub social card.",
        "body_class": "page-docs",
        "nav": "docs",
        "kind": "article",
        "schema": "docs",
        "short": "Documentation",
    },
    "docs/vision.html": {
        "title": "Project vision — Ametherian",
        "description": (
            "The Ametherian project vision: a family of focused "
            "JavaScript and TypeScript packages with clear boundaries."
        ),
        "og_title": "Project vision",
        "og_subtitle": (
            "A cohesive ecosystem of focused packages — not one oversized "
            "dependency."
        ),
        "og_label": "DOCUMENT",
        "og_key": "vision",
        "og_alt": "Ametherian project vision social card.",
        "body_class": "page-docs",
        "nav": "vision",
        "kind": "article",
        "schema": "doc",
        "short": "Project vision",
        "eyebrow": "Document",
    },
    "docs/packages.html": {
        "title": "Package map — Ametherian",
        "description": (
            "The Ametherian package map: networking, data and "
            "serialization, application infrastructure, security engineering, "
            "and observability research areas."
        ),
        "og_title": "Package map",
        "og_subtitle": (
            "Five research areas. Candidate packages."
        ),
        "og_label": "DOCUMENT",
        "og_key": "packages",
        "og_alt": "Ametherian package map social card.",
        "body_class": "page-docs",
        "nav": "packages",
        "kind": "article",
        "schema": "doc",
        "short": "Package map",
        "eyebrow": "Document",
    },
    "docs/architecture.html": {
        "title": "Architecture direction — Ametherian",
        "description": (
            "Ametherian architecture direction: modular packages, shared "
            "contracts, explicit Node.js runtime boundaries, and resource safety."
        ),
        "og_title": "Architecture direction",
        "og_subtitle": (
            "Modular packages, explicit runtime boundaries, shared contracts."
        ),
        "og_label": "DOCUMENT",
        "og_key": "architecture",
        "og_alt": "Ametherian architecture direction social card.",
        "body_class": "page-docs",
        "nav": "architecture",
        "kind": "article",
        "schema": "doc",
        "short": "Architecture",
        "eyebrow": "Document",
    },
    "docs/security.html": {
        "title": "Security approach — Ametherian",
        "description": (
            "The Ametherian security approach: threat modeling, secure "
            "engineering practices, vulnerability intelligence, and coordinated "
            "disclosure."
        ),
        "og_title": "Security approach",
        "og_subtitle": (
            "Threat models, bounded resources, and evidence-backed claims."
        ),
        "og_label": "DOCUMENT",
        "og_key": "security-approach",
        "og_alt": "Ametherian security approach social card.",
        "body_class": "page-docs",
        "nav": "security",
        "kind": "article",
        "schema": "doc",
        "short": "Security approach",
        "eyebrow": "Document",
    },
    "docs/roadmap.html": {
        "title": "Roadmap — Ametherian",
        "description": (
            "The staged Ametherian roadmap: research, specifications, "
            "implementation, and release readiness."
        ),
        "og_title": "Roadmap",
        "og_subtitle": (
            "Research, specifications, implementation, and release readiness."
        ),
        "og_label": "DOCUMENT",
        "og_key": "roadmap",
        "og_alt": "Ametherian roadmap social card.",
        "body_class": "page-docs",
        "nav": "roadmap",
        "kind": "article",
        "schema": "doc",
        "short": "Roadmap",
        "eyebrow": "Document",
    },
    "SECURITY.html": {
        "title": "Security policy — Ametherian",
        "description": (
            "Ametherian security policy: reporting vulnerabilities, and the "
            "intended security process for future packages."
        ),
        "og_title": "Security policy",
        "og_subtitle": (
            "Reporting status and the intended security process."
        ),
        "og_label": "POLICY",
        "og_key": "security-policy",
        "og_alt": "Ametherian security policy social card.",
        "body_class": "page-docs",
        "nav": "security-policy",
        "kind": "article",
        "schema": "policy",
        "short": "Security policy",
        "eyebrow": "Policy",
    },
    "CONTRIBUTING.html": {
        "title": "Contributing — Ametherian",
        "description": (
            "How to contribute feedback to Ametherian: standards, "
            "pull request expectations, and links to the code of conduct."
        ),
        "og_title": "Contributing",
        "og_subtitle": (
            "How to give feedback on the direction and architecture."
        ),
        "og_label": "POLICY",
        "og_key": "contributing",
        "og_alt": "Ametherian contributing guide social card.",
        "body_class": "page-docs",
        "nav": "contributing",
        "kind": "article",
        "schema": "policy",
        "short": "Contributing",
        "eyebrow": "Policy",
    },
    "sitemap/index.html": {
        "title": "XML sitemap — Ametherian",
        "description": "Browse the public pages and documentation in the Ametherian project.",
        "og_title": "XML sitemap",
        "og_subtitle": "A structured directory of Ametherian's public website.",
        "og_label": "SITE INDEX",
        "og_key": "home",
        "og_alt": "Ametherian XML sitemap and public website directory.",
        "body_class": "page-home",
        "nav": "",
        "kind": "website",
        "schema": "website",
        "short": "XML sitemap",
        "eyebrow": "Site index",
    },

    "llms/index.html": {
        "title": "AI & machine-readable resources — Ametherian",
        "description": "Human-friendly directory of Ametherian machine-readable resources, including llms.txt, full project context, XML sitemap, and site configuration.",
        "og_title": "AI & machine-readable resources",
        "og_subtitle": "Structured project context and discovery endpoints.",
        "og_label": "RESOURCES",
        "og_key": "docs",
        "og_alt": "Ametherian machine-readable resources directory.",
        "body_class": "page-home",
        "nav": "resources",
        "kind": "article",
        "schema": "doc",
        "short": "AI resources",
    },

    "404.html": {
        "title": "Page not found — Ametherian",
        "description": "The requested page is not part of the Ametherian site.",
        "og_title": "Page not found",
        "og_subtitle": "This page does not exist.",
        "og_label": "404",
        "og_key": "404",
        "og_alt": "Ametherian page not found social card.",
        "body_class": "page-404",
        "nav": "",
        "kind": "website",
        "schema": "404",
        "robots": "noindex,follow",
    },
}

ROUTES = {
    "index.html": "/",
    "docs/index.html": "/docs/",
    "docs/vision.html": "/docs/vision/",
    "docs/packages.html": "/docs/packages/",
    "docs/architecture.html": "/docs/architecture/",
    "docs/security.html": "/docs/security/",
    "docs/roadmap.html": "/docs/roadmap/",
    "SECURITY.html": "/security/",
    "CONTRIBUTING.html": "/contributing/",
    "sitemap/index.html": "/sitemap/",
    "llms/index.html": "/llms/",
    "404.html": "/404.html",
}


DOC_ORDER = [
    ("docs/index.html", "Documentation"),
    ("docs/vision.html", "Project vision"),
    ("docs/packages.html", "Package map"),
    ("docs/architecture.html", "Architecture"),
    ("docs/security.html", "Security approach"),
    ("docs/roadmap.html", "Roadmap"),
    ("SECURITY.html", "Security policy"),
    ("CONTRIBUTING.html", "Contributing"),
]

DOC_NAV = [
    (
        "Overview",
        [
            ("Documentation home", "docs/index.html", "docs"),
            ("Project vision", "docs/vision.html", "vision"),
        ],
    ),
    (
        "Architecture",
        [
            ("Package map", "docs/packages.html", "packages"),
            ("Architecture direction", "docs/architecture.html", "architecture"),
            ("Security approach", "docs/security.html", "security"),
            ("Roadmap", "docs/roadmap.html", "roadmap"),
        ],
    ),
    (
        "Policies",
        [
            ("Security policy", "SECURITY.html", "security-policy"),
            ("Contributing", "CONTRIBUTING.html", "contributing"),
        ],
    ),
]

SIDEBAR_RECORDS = [
    ("Project status", "PROJECT_STATUS.md"),
    ("Project brief", "AMETHERIAN-PROJECT-BRIEF.txt"),
    ("Technical references", "REFERENCES.md"),
    ("License status", "LICENSE-STATUS.md"),
    ("Notice", "NOTICE.md"),
]

SOCIALS = [
    ("Twitch", "https://www.twitch.tv/akasammythepuppy", "twitch"),
    ("Kick", "https://kick.com/akasammythepuppy", "kick"),
    ("YouTube", "https://www.youtube.com/@akasammythepuppy", "youtube"),
    ("TikTok @akasammythepuppy", "https://www.tiktok.com/@akasammythepuppy", "tiktok"),
    ("TikTok @alphapupsammy", "https://www.tiktok.com/@alphapupsammy", "tiktok"),
    ("Instagram", "https://www.instagram.com/akasammythepuppy", "instagram"),
    ("Bluesky", "https://bsky.app/profile/akasammythepuppy.me", "bluesky"),
    ("X", "https://x.com/akasammythepup", "x"),
    ("LinkedIn", "https://www.linkedin.com/in/foulfoxhacks/", "linkedin"),
    ("GitHub", "https://github.com/foulfoxhacks", "github"),
    ("Spotify", "https://open.spotify.com/user/2z4kruowiuhpf3w0vvhmhdpoz", "spotify"),
]

ICONS = {
    "network": (
        '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/>'
        '<circle cx="19" cy="18" r="2.2"/><path d="M10.8 6.9 6.3 16M13.2 6.9l4.5 9.1M7.2 18h9.6"/>'
    ),
    "data": '<path d="m8 4-4 8 4 8M16 4l4 8-4 8M13.5 5 10.5 19"/>',
    "layers": (
        '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5"/>'
        '<path d="m4 16.5 8 4.5 8-4.5"/>'
    ),
    "shield": (
        '<path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9.5 4.1-1.8 7-5.2 7-9.5V6l-7-3Z"/>'
        '<path d="m9.2 11.8 2 2 3.8-4"/>'
    ),
    "activity": '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    "package": (
        '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'
    ),
    "document": '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
    "plug": (
        '<path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 0 1-10 0V7Z"/><path d="M12 17v4"/>'
    ),
    "flask": (
        '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/>'
        '<path d="M8 15h8"/>'
    ),
    "people": (
        '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/>'
        '<circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.2A4.5 4.5 0 0 1 20.5 20"/>'
    ),
    "compass": (
        '<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2 5.2-5.2 2 2-5.2 5.2-2Z"/>'
    ),
}

GITHUB_PATH = (
    "M12 .9a11.1 11.1 0 0 0-3.51 21.63c.55.1.76-.24.76-.53v-2.05c-3.1.67"
    "-3.76-1.32-3.76-1.32-.5-1.28-1.24-1.62-1.24-1.62-1.01-.69.08-.68.08"
    "-.68 1.12.08 1.7 1.15 1.7 1.15.99 1.7 2.6 1.21 3.23.92.1-.72.39-1.21"
    ".7-1.49-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28"
    "-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.14a10.6 10.6 0 0 1 5.55 0c2.12"
    "-1.44 3.05-1.14 3.05-1.14.61 1.54.23 2.68.12 2.96.71.78 1.14 1.78"
    " 1.14 3 0 4.29-2.61 5.23-5.1 5.5.4.35.75 1.03.75 2.08V22c0 .29.2.64"
    ".77.53A11.1 11.1 0 0 0 12 .9Z"
)

SOCIAL_ICONS = {
    "twitch": '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>',
    "kick": '<path d="M2 3h4v6h2V7h2V5h2V3h6v6h-2v2h-2v2h2v2h2v6h-6v-2h-2v-2h-2v-2H6v6H2V3Z"/>',
    "youtube": '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
    "tiktok": '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    "instagram": '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>',
    "bluesky": '<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/>',
    "x": '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
    "linkedin": '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
    "github": f'<path d="{GITHUB_PATH}"/>',
    "spotify": '<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>',
}

def social_icon(name: str) -> str:
    return f'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{SOCIAL_ICONS[name]}</svg>'

def route_for(target: str) -> str:
    """Return the public clean URL for a generated page or static resource."""
    if target.startswith(("http://", "https://", "mailto:", "tel:", "#")):
        return target
    path, separator, fragment = target.partition("#")
    route = ROUTES.get(path, "/" + path.lstrip("/"))
    return route + (separator + fragment if separator else "")


def url_for(target: str, current: str = "") -> str:
    # Root-relative links remain stable when pages move into directory indexes.
    return route_for(target)


def canonical(path: str) -> str:
    return BASE + route_for(path)


def og_image(key: str) -> str:
    return f"{BASE}/assets/og/{key}.png"


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def icon(name: str, extra: str = "") -> str:
    return (
        f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true"{extra}>{ICONS[name]}</svg>'
    )


def github_icon() -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        f'<path d="{GITHUB_PATH}"/></svg>'
    )


def search_icon() -> str:
    return (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="1.8" stroke-linecap="round" aria-hidden="true">'
        '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>'
    )


def schema_graph(path: str, faqs=None) -> str:
    meta = PAGES[path]
    url = canonical(path)
    website_id = BASE + "/#website"
    org_id = BASE + "/#organization"
    graph = [
        {
            "@type": "WebSite",
            "@id": website_id,
            "url": BASE + "/",
            "name": "Ametherian",
            "description": "An independent Node.js library ecosystem.",
            "publisher": {"@id": org_id},
            "inLanguage": "en",
        },
        {
            "@type": "Organization",
            "@id": org_id,
            "name": "Ametherian",
            "url": BASE + "/",
            "parentOrganization": {"@type": "Organization", "name": "FoulFoxHacks"},
        },
    ]
    if meta["schema"] == "website":
        graph.append(
            {
                "@type": "WebPage",
                "@id": url + "#page",
                "url": url,
                "name": meta["title"],
                "description": meta["description"],
                "isPartOf": {"@id": website_id},
                "about": {"@id": org_id},
                "primaryImageOfPage": og_image(meta["og_key"]),
                "inLanguage": "en",
            }
        )
        if faqs:
            graph.append(
                {
                    "@type": "FAQPage",
                    "@id": url + "#faq",
                    "isPartOf": {"@id": url + "#page"},
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": plain},
                        }
                        for q, _, plain in faqs
                    ],
                }
            )
    elif meta["schema"] in {"doc", "docs", "policy"}:
        graph.append(
            {
                "@type": "TechArticle" if meta["schema"] != "policy" else "WebPage",
                "@id": url + "#page",
                "url": url,
                "headline": meta["title"].split(" — ")[0],
                "description": meta["description"],
                "isPartOf": {"@id": website_id},
                "publisher": {"@id": org_id},
                "dateModified": TODAY,
                "inLanguage": "en",
                "primaryImageOfPage": og_image(meta["og_key"]),
            }
        )
        if meta["schema"] != "policy":
            graph.append(
                {
                    "@type": "BreadcrumbList",
                    "@id": url + "#breadcrumb",
                    "itemListElement": [
                        {
                            "@type": "ListItem",
                            "position": 1,
                            "name": "Home",
                            "item": BASE + "/",
                        },
                        {
                            "@type": "ListItem",
                            "position": 2,
                            "name": "Documentation",
                            "item": BASE + "/docs/",
                        },
                        {
                            "@type": "ListItem",
                            "position": 3,
                            "name": meta["short"],
                            "item": url,
                        },
                    ],
                }
            )
    return json.dumps(
        {"@context": "https://schema.org", "@graph": graph},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def head(path: str, faqs=None, *, robots: str | None = None) -> str:
    meta = PAGES[path]
    title = meta["title"]
    description = meta["description"]
    robots = robots or meta.get(
        "robots",
        "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1",
    )
    image = og_image(meta["og_key"])
    extra_stylesheet = ""
    if path == "sitemap/index.html":
        extra_stylesheet = f'<link rel="stylesheet" href="{url_for("assets/sitemap.css", path)}">'
    elif path == "llms/index.html":
        resource_css = url_for("assets/resources.css", path)
        extra_stylesheet = f'<link rel="stylesheet" href="{resource_css}">'
    return f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="robots" content="{robots}">
<meta name="author" content="FoulFoxHacks">
<meta name="publisher" content="FoulFoxHacks">
<meta name="theme-color" content="#0b0812">
<meta name="color-scheme" content="dark light">
<link rel="canonical" href="{canonical(path)}">
<link rel="icon" href="{url_for('assets/favicon.ico', path)}" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="{url_for('assets/favicon.svg', path)}">
<link rel="apple-touch-icon" href="{url_for('assets/apple-touch-icon.png', path)}">
<link rel="manifest" href="{url_for('assets/site.webmanifest', path)}">
<link rel="stylesheet" href="{url_for('assets/site.css', path)}">
<meta property="og:type" content="{'website' if meta['kind'] == 'website' else 'article'}">
<meta property="og:site_name" content="Ametherian">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{canonical(path)}">
<meta property="og:image" content="{image}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(meta['og_alt'])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(description)}">
<meta name="twitter:image" content="{image}">
<meta name="twitter:image:alt" content="{esc(meta['og_alt'])}">
{extra_stylesheet}
<script type="application/ld+json">{schema_graph(path, faqs)}</script>"""


NAV_ITEMS = [
    ("Docs", "docs/index.html", "docs"),
    ("Resources", "llms/index.html", "resources"),
    ("Vision", "docs/vision.html", "vision"),
    ("Packages", "docs/packages.html", "packages"),
    ("Architecture", "docs/architecture.html", "architecture"),
    ("Security", "docs/security.html", "security"),
    ("Roadmap", "docs/roadmap.html", "roadmap"),
]


def site_header(current: str, active: str) -> str:
    links = []
    for label, target, key in NAV_ITEMS:
        current_attr = ' aria-current="page"' if key == active else ""
        links.append(f'<a href="{url_for(target, current)}"{current_attr}>{label}</a>')
    return f"""<header class="site-header" data-site-header>
  <div class="shell header-inner">
    <a class="brand" href="{url_for('index.html', current)}">
      <img src="{url_for('assets/ametherian-mark.svg', current)}" alt="" width="31" height="32">
      <span>Ametherian</span>
    </a>
    <button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav" data-menu-button>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      <span>Menu</span>
    </button>
    <nav class="site-nav" id="site-nav" aria-label="Main navigation">
      {''.join(links)}
    </nav>
    <div class="header-actions">
      <a class="icon-link" href="{REPO}" target="_blank" rel="noopener noreferrer" aria-label="Ametherian source repository on GitHub (opens in a new tab)">{github_icon()}</a>
    </div>
  </div>
</header>"""


def site_footer(current: str) -> str:
    socials = []
    for name, url, icon_name in SOCIALS:
        socials.append(
            f'<a href="{url}" target="_blank" rel="me noopener noreferrer" aria-label="{esc(name)} (opens in a new tab)">'
            f'{social_icon(icon_name)}</a>'
        )
    return f"""<footer class="site-footer">
  <div class="shell footer-main">
    <div class="footer-brand">
      <a class="brand" href="{url_for('index.html', current)}">
        <img src="{url_for('assets/ametherian-mark.svg', current)}" alt="" width="40" height="41">
        <span>Ametherian</span>
      </a>
      <p>A new kind of Node library ecosystem by FoulFoxHacks.</p>
      <p class="footer-brand__note">Node.js is a trademark of the OpenJS Foundation. Ametherian is not affiliated with or endorsed by the OpenJS Foundation, Node.js, Axios, or Undici.</p>
    </div>
    <div class="footer-col">
      <h2>Project</h2>
      <a href="{url_for('docs/vision.html', current)}">Project vision</a>
      <a href="{url_for('docs/packages.html', current)}">Package map</a>
      <a href="{url_for('docs/architecture.html', current)}">Architecture</a>
      <a href="{url_for('docs/roadmap.html', current)}">Roadmap</a>
    </div>
    <div class="footer-col">
      <h2>Documentation</h2>
      <a href="{url_for('docs/index.html', current)}">Documentation home</a>
      <a href="{url_for('docs/security.html', current)}">Security approach</a>
      <a href="{url_for('SECURITY.html', current)}">Security policy</a>
      <a href="{url_for('CONTRIBUTING.html', current)}">Contributing</a>
    </div>
    <div class="footer-col">
      <h2>Links</h2>
      <a href="{REPO}" target="_blank" rel="noopener noreferrer">Source repository <span aria-hidden="true">↗</span></a>
      <a href="{FOULFOX}" target="_blank" rel="noopener noreferrer">FoulFoxHacks <span aria-hidden="true">↗</span></a>
      <a href="{url_for('sitemap/index.html', current)}">Visual sitemap</a>
      <a href="{url_for('llms/index.html', current)}">AI resource directory</a>
      <a href="{url_for('sitemap.xml', current)}">XML sitemap</a>
      <a href="{url_for('llms.txt', current)}">llms.txt</a>
      <a href="{url_for('llms-full.txt', current)}">llms-full.txt</a>
    </div>
  </div>
  <div class="footer-social">
    <div class="shell">
      <h2 class="footer-social__title">Socials</h2>
      <div class="footer-socials">{''.join(socials)}</div>
    </div>
  </div>
  <div class="shell footer-bottom">
    <p>© {YEAR} FoulFoxHacks · Ametherian</p>
    <p>Independent project. No affiliation with Node.js, OpenJS, Axios, or Undici.</p>
    <div class="footer-legal">
      <a href="{url_for('SECURITY.html', current)}">Security</a>
      <a href="{url_for('CONTRIBUTING.html', current)}">Contributing</a>
      <a href="#main">Back to top <span aria-hidden="true">↑</span></a>
    </div>
  </div>
</footer>"""


def root_prefix(path: str) -> str:
    # All internal links and assets are root-relative.
    return ""


def canonical_path_script(path: str) -> str:
    """Canonicalize unavoidable GitHub Pages index.html aliases in-browser."""
    aliases = {
        "index.html": ("/index.html", "/"),
        "docs/index.html": ("/docs/index.html", "/docs/"),
        "sitemap/index.html": ("/sitemap/index.html", "/sitemap/"),
        "llms/index.html": ("/llms/index.html", "/llms/"),
    }
    alias = aliases.get(path)
    if not alias:
        return ""
    old_path, clean_path = alias
    return (
        "<script>"
        f"if (window.location.pathname === {json.dumps(old_path)}) "
        f"window.location.replace({json.dumps(clean_path)} + window.location.search + window.location.hash);"
        "</script>"
    )


def site_shell(path: str, body: str, faqs=None) -> str:
    meta = PAGES[path]
    return f"""<!doctype html>
<html lang="en">
<head>
{head(path, faqs)}
</head>
<body class="{meta['body_class']}" data-root="{root_prefix(path)}">
<a class="skip-link" href="#main">Skip to content</a>
{site_header(path, meta['nav'])}
{body}
{site_footer(path)}
{canonical_path_script(path)}
<script src="{url_for('assets/site.js', path)}" defer></script>
</body>
</html>
"""


def breadcrumbs(path: str, last: str) -> str:
    home = url_for("index.html", path)
    docs = url_for("docs/index.html", path)
    if path == "docs/index.html":
        return (
            f'<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="{home}">Home</a>'
            f'<span aria-hidden="true">/</span><span aria-current="page">Documentation</span></nav>'
        )
    return (
        f'<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="{home}">Home</a>'
        f'<span aria-hidden="true">/</span><a href="{docs}">Documentation</a>'
        f'<span aria-hidden="true">/</span><span aria-current="page">{esc(last)}</span></nav>'
    )


def docs_sidebar(path: str) -> str:
    groups = []
    for title, links in DOC_NAV:
        items = []
        for label, target, key in links:
            active = ' aria-current="page"' if key == PAGES[path].get("nav") else ""
            items.append(f'<a href="{url_for(target, path)}"{active}>{label}</a>')
        groups.append(
            f'<div class="docs-nav-group"><p class="docs-nav-title">{title}</p>'
            f'{"".join(items)}</div>'
        )
    records = "".join(
        f'<a href="{url_for(target, path)}">{label}</a>'
        for label, target in SIDEBAR_RECORDS
    )
    groups.append(
        f'<div class="docs-nav-group"><p class="docs-nav-title">Project records</p>{records}</div>'
    )
    return f"""<aside class="docs-sidebar" aria-label="Documentation navigation">
  <div class="docs-sidebar__head">
    <p class="eyebrow">Documentation</p>
    <button class="search-trigger search-trigger--sidebar" type="button" data-search-open>
      {search_icon()}<span>Search docs</span><kbd>/</kbd>
    </button>
  </div>
  <nav class="docs-nav">
    {''.join(groups)}
  </nav>
  <div class="docs-sidebar__note">
    <p><strong>Status:</strong> Planning and specification stage.</p>
    <p><a href="{url_for('PROJECT_STATUS.md', path)}">Project status</a> · <a href="{url_for('NOTICE.md', path)}">Notice</a> · <a href="{url_for('LICENSE-STATUS.md', path)}">License</a></p>
  </div>
</aside>"""


def docs_header(path: str) -> str:
    return f"""<header class="docs-header" data-site-header>
  <div class="docs-header__inner">
    <a class="brand" href="{url_for('index.html', path)}">
      <img src="{url_for('assets/ametherian-mark.svg', path)}" alt="" width="28" height="29">
      <span>Ametherian</span>
    </a>
    <div class="docs-header__actions">
      <button class="search-trigger" type="button" data-search-open>
        {search_icon()}<span>Search</span><kbd>/</kbd>
      </button>
      <a class="header-link" href="{url_for('index.html', path)}">Project home</a>
      <a class="icon-link" href="{REPO}" target="_blank" rel="noopener noreferrer" aria-label="Ametherian source repository on GitHub (opens in a new tab)">{github_icon()}</a>
    </div>
  </div>
</header>"""


def search_dialog(path: str) -> str:
    return """<dialog class="search-dialog" data-search-dialog aria-labelledby="search-title">
  <h2 class="visually-hidden" id="search-title">Search documentation</h2>
  <div class="search-dialog__form" role="search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
    <label class="visually-hidden" for="search-input">Search documentation</label>
    <input class="search-dialog__input" id="search-input" type="search" placeholder="Search…" autocomplete="off" spellcheck="false" data-search-input>
    <button class="search-dialog__close" type="button" data-search-close>Esc</button>
  </div>
  <p class="search-empty" data-search-status aria-live="polite">Type to search titles, sections, and descriptions.</p>
  <ul class="search-results" data-search-results></ul>
</dialog>"""


def docs_footer(path: str) -> str:
    return f"""<footer class="docs-footer">
  <div class="docs-footer__inner">
    <p>© {YEAR} FoulFoxHacks · Ametherian is an independent project.</p>
    <div class="docs-footer__links">
      <a href="{url_for('docs/index.html', path)}">Documentation</a>
      <a href="{url_for('SECURITY.html', path)}">Security policy</a>
      <a href="{REPO}" target="_blank" rel="noopener noreferrer">Source <span aria-hidden="true">↗</span></a>
    </div>
  </div>
</footer>"""


def heading_anchor(body: str) -> str:
    pattern = re.compile(r'(<h([23])\s+id="([^"]+)"[^>]*>)(.*?)(</h\2>)', flags=re.S)

    def repl(match: re.Match[str]) -> str:
        return (
            match.group(1)
            + match.group(4)
            + f'<a class="heading-anchor" href="#{match.group(3)}" '
            f'aria-label="Link to this section">#</a>'
            + match.group(5)
        )

    return pattern.sub(repl, body)


def toc_html(body: str) -> str:
    headings = re.findall(r'<h([23])\s+id="([^"]+)"[^>]*>(.*?)</h\1>', body, flags=re.S)
    items = []
    for level, ident, label in headings:
        text = html.unescape(re.sub(r"<[^>]+>", "", label)).strip()
        cls = ' class="toc-sub"' if level == "3" else ""
        items.append(f'<a href="#{ident}"{cls}>{esc(text)}</a>')
    if not items:
        return ""
    return f"""<aside class="docs-toc" aria-label="On this page">
  <p class="docs-nav-title">On this page</p>
  {''.join(items)}
  <a class="toc-top" href="#main">Top of page <span aria-hidden="true">↑</span></a>
</aside>"""


def doc_pager(path: str) -> str:
    index = next((i for i, (target, _) in enumerate(DOC_ORDER) if target == path), None)
    if index is None:
        return ""
    parts = []
    if index > 0:
        prev_path, prev_label = DOC_ORDER[index - 1]
        parts.append(
            f'<a href="{url_for(prev_path, path)}"><span>Previous</span><strong>'
            f'<span aria-hidden="true">←</span> {prev_label}</strong></a>'
        )
    else:
        parts.append("<span></span>")
    if index < len(DOC_ORDER) - 1:
        next_path, next_label = DOC_ORDER[index + 1]
        parts.append(
            f'<a href="{url_for(next_path, path)}" class="doc-pager__next"><span>Next</span><strong>'
            f'{next_label} <span aria-hidden="true">→</span></strong></a>'
        )
    return f'<nav class="doc-pager" aria-label="Documentation pagination">{"".join(parts)}</nav>'


def docs_shell(
    path: str,
    h1: str,
    lead: str,
    body: str,
    *,
    pager: bool = True,
) -> str:
    meta = PAGES[path]
    content = f"""<div class="docs-layout">
{docs_sidebar(path)}
<main id="main" class="docs-content">
  {breadcrumbs(path, meta['short'])}
  <div class="doc-head">
    <p class="eyebrow">{meta.get('eyebrow', 'Documentation')}</p>
    <h1>{h1}</h1>
    <p class="doc-lead">{lead}</p>
    <div class="doc-meta">
      <span>Reviewed November 2026</span>
      <span class="doc-meta__dot" aria-hidden="true">·</span>
      <span><a href="{REPO}" target="_blank" rel="noopener noreferrer">Source repository <span aria-hidden="true">↗</span></a></span>
    </div>
  </div>
  <div class="prose">
    {heading_anchor(body)}
  </div>
  <div class="doc-end">
    <p><strong>Independent project.</strong> Ametherian is not affiliated with or endorsed by Node.js, the OpenJS Foundation, Axios, Undici, or any other referenced project. Node.js is a trademark of the OpenJS Foundation.</p>
  </div>
  {doc_pager(path) if pager else ''}
</main>
{toc_html(body)}
</div>
{docs_footer(path)}
{search_dialog(path)}"""
    return f"""<!doctype html>
<html lang="en">
<head>
{head(path)}
</head>
<body class="{meta['body_class']}" data-root="{root_prefix(path)}">
<a class="skip-link" href="#main">Skip to content</a>
{docs_header(path)}
{content}
<script src="{url_for('assets/search-index.js', path)}" defer></script>
<script src="{url_for('assets/site.js', path)}" defer></script>
{canonical_path_script(path)}
</body>
</html>
"""
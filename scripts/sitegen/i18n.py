"""Internationalisation for the static site.

English is the source. Each translated page is rendered from the built English
page using the sentences in i18n/<code>.json, so a translation can never drift
from the page it translates. The language set matches akasammythepuppy.me.

What is translated: text nodes and the user-visible attributes (title, alt,
aria-label, placeholder, meta descriptions and social titles). What is not:
<code>, <pre>, <script>, <style>, <svg>, and anything inside an element with
translate="no" (the changelog body, package names).
"""

from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser

from .common import BASE, ROOT

DEFAULT = {"code": "en", "lang": "en", "hreflang": "en", "og": "en_US", "name": "English", "short": "EN", "prefix": ""}
LOCALES = [
    {"code": "es", "lang": "es", "hreflang": "es", "og": "es_ES", "name": "Español", "short": "ES", "prefix": "/es"},
    {"code": "pt-br", "lang": "pt-BR", "hreflang": "pt-BR", "og": "pt_BR", "name": "Português (Brasil)", "short": "PT", "prefix": "/pt-br"},
    {"code": "de", "lang": "de", "hreflang": "de", "og": "de_DE", "name": "Deutsch", "short": "DE", "prefix": "/de"},
    {"code": "fr", "lang": "fr", "hreflang": "fr", "og": "fr_FR", "name": "Français", "short": "FR", "prefix": "/fr"},
    {"code": "ru", "lang": "ru", "hreflang": "ru", "og": "ru_RU", "name": "Русский", "short": "RU", "prefix": "/ru"},
    {"code": "ja", "lang": "ja", "hreflang": "ja", "og": "ja_JP", "name": "日本語", "short": "JA", "prefix": "/ja"},
    {"code": "zh-cn", "lang": "zh-Hans", "hreflang": "zh-CN", "og": "zh_CN", "name": "简体中文", "short": "ZH", "prefix": "/zh-cn"},
]
ALL = [DEFAULT, *LOCALES]

SKIP_TAGS = {"script", "style", "code", "pre", "svg", "kbd", "samp"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
TEXT_ATTRS = ("title", "alt", "aria-label", "placeholder")
META_CONTENT = {"description", "og:title", "og:description", "og:image:alt", "twitter:title", "twitter:description", "twitter:image:alt", "og:site_name"}
WORDY = re.compile(r"[A-Za-z]{2,}")


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def translatable(text: str) -> bool:
    t = norm(text)
    return bool(t) and bool(WORDY.search(t)) and not re.fullmatch(r"https?://\S+|[\w.-]+\.(txt|xml|json|html|mjs|js|css|md)|@[\w/.-]+|v?\d[\w.+-]*", t)


def catalog(code: str) -> dict[str, str]:
    path = ROOT / "i18n" / f"{code}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def localized_route(route: str, locale: dict) -> str:
    return f"{locale['prefix']}{route}"


class _Walker(HTMLParser):
    """Re-emits HTML, transforming text and selected attributes."""

    def __init__(self, on_text, on_attr):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.stack: list[tuple[str, bool]] = []  # (tag, skip)
        self.on_text = on_text
        self.on_attr = on_attr

    @property
    def skipping(self) -> bool:
        return bool(self.stack) and self.stack[-1][1]

    def _tag(self, tag, attrs, close=""):
        attrs = self.on_attr(tag, attrs, self.skipping)
        parts = [tag]
        for k, v in attrs:
            parts.append(k if v is None else f'{k}="{html.escape(v, quote=True)}"')
        return "<" + " ".join(parts) + close + ">"

    def handle_starttag(self, tag, attrs):
        self.out.append(self._tag(tag, attrs))
        if tag in VOID:
            return
        skip = self.skipping or tag in SKIP_TAGS or dict(attrs).get("translate") == "no"
        self.stack.append((tag, skip))

    def handle_startendtag(self, tag, attrs):
        self.out.append(self._tag(tag, attrs, " /"))

    def handle_endtag(self, tag):
        self.out.append(f"</{tag}>")
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        tag = self.stack[-1][0] if self.stack else ""
        if tag in ("script", "style"):
            self.out.append(data)
        elif self.skipping:
            self.out.append(html.escape(data, quote=False))
        else:
            self.out.append(html.escape(self.on_text(data), quote=False))

    def handle_comment(self, data):
        self.out.append(f"<!--{data}-->")

    def handle_decl(self, decl):
        self.out.append(f"<!{decl}>")

    def handle_pi(self, data):
        self.out.append(f"<?{data}>")


def _apply(text: str, table: dict[str, str]) -> str:
    key = norm(text)
    if not key or key not in table:
        return text
    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    return f"{lead}{table[key]}{trail}"


def extract(source: str) -> list[str]:
    """Translatable segments of an English page, in document order."""
    found: list[str] = []

    def on_text(t):
        if translatable(t):
            found.append(norm(t))
        return t

    def on_attr(tag, attrs, skipping):
        d = dict(attrs)
        if not skipping:
            for k in TEXT_ATTRS:
                if d.get(k) and translatable(d[k]):
                    found.append(norm(d[k]))
        if tag == "meta" and (d.get("name") in META_CONTENT or d.get("property") in META_CONTENT) and d.get("content") and translatable(d["content"]):
            found.append(norm(d["content"]))
        return attrs

    w = _Walker(on_text, on_attr)
    w.feed(source)
    w.close()
    return found


def translate_page(source: str, locale: dict, route: str, translated_routes: set[str]) -> str:
    table = catalog(locale["code"])
    page_url = BASE + route
    local_url = BASE + localized_route(route, locale)

    def on_text(t):
        return _apply(t, table)

    def on_attr(tag, attrs, skipping):
        out = []
        d = dict(attrs)
        for k, v in attrs:
            if v is None:
                out.append((k, v))
                continue
            if k in TEXT_ATTRS and not skipping:
                v = _apply(v, table)
            elif tag == "meta" and k == "content":
                key = d.get("name") or d.get("property")
                if key in META_CONTENT:
                    v = _apply(v, table)
                elif key == "og:locale":
                    v = locale["og"]
                elif key == "og:url" and v == page_url:
                    v = local_url
            elif tag == "link" and k == "href" and d.get("rel") == "canonical" and v == page_url:
                v = local_url
            elif tag == "a" and k == "href" and v.startswith("/") and not v.startswith("//"):
                path, _, frag = v.partition("#")
                if path in translated_routes:
                    v = localized_route(path, locale) + (f"#{frag}" if frag else "")
            elif tag == "html" and k == "lang":
                v = locale["lang"]
            out.append((k, v))
        return out

    w = _Walker(on_text, on_attr)
    w.feed(source)
    w.close()
    result = "".join(w.out)
    # JSON-LD: point the page URL at the localized page and declare the language.
    result = result.replace(f'"url":"{page_url}"', f'"url":"{local_url}"').replace(f'"url": "{page_url}"', f'"url": "{local_url}"')
    result = result.replace('"inLanguage":"en"', f'"inLanguage":"{locale["lang"]}"').replace('"inLanguage": "en"', f'"inLanguage": "{locale["lang"]}"')
    # Per-language search index.
    result = result.replace('src="/assets/search-index.js"', f'src="/assets/search-index.{locale["code"]}.js"')
    return result


def alternates(route: str) -> str:
    links = [f'<link rel="alternate" hreflang="{l["hreflang"]}" href="{BASE}{localized_route(route, l)}">' for l in ALL]
    links.append(f'<link rel="alternate" hreflang="x-default" href="{BASE}{route}">')
    return "\n".join(links)


def switcher(route: str, current: dict) -> str:
    items = []
    for l in ALL:
        attr = ' aria-current="true"' if l["code"] == current["code"] else ""
        items.append(f'<li><a href="{localized_route(route, l)}" hreflang="{l["hreflang"]}" lang="{l["lang"]}"{attr}>{html.escape(l["name"])}</a></li>')
    return (
        '<details class="lang-switch" data-lang-switch><summary aria-label="Language">'
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/></svg>'
        f'<span>{current["short"]}</span></summary><ul translate="no">{"".join(items)}</ul></details>'
    )


def decorate(source: str, route: str, locale: dict) -> str:
    """Insert hreflang alternates and the language switcher."""
    source = source.replace("<!--HREFLANG-->", alternates(route))
    return source.replace("<!--LANG-SWITCH-->", switcher(route, locale))

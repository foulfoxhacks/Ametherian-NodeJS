/* Ametherian visual sitemap: reads the sitemap index, then each language sitemap. */
(() => {
  "use strict";
  const output = document.querySelector("[data-sitemap-output]");
  const status = document.querySelector("[data-sitemap-status]");
  const search = document.querySelector("[data-sitemap-search]");
  if (!output || !status) return;

  const indexUrl = new URL("/sitemap.xml", location.href);
  const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const LANGS = { en: "English", es: "Español", "pt-br": "Português (Brasil)", de: "Deutsch", fr: "Français", ru: "Русский", ja: "日本語", "zh-cn": "简体中文" };

  const sameOrigin = (value) => {
    try {
      const url = new URL(value, location.href);
      // Sitemaps list canonical production URLs; show them, but navigate within this origin.
      return new URL(url.pathname + url.search + url.hash, location.origin).href;
    } catch { return null; }
  };
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const parse = async (url, expectedRoot) => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load ${url}`);
    const source = await response.text();
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Prohibited document type or entity declaration.");
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.querySelector("parsererror") || doc.documentElement.localName !== expectedRoot) throw new Error(`Not a valid ${expectedRoot}.`);
    return doc;
  };
  const text = (node, name) => node.getElementsByTagNameNS(ns, name)[0]?.textContent?.trim() || "";

  const render = (groups) => {
    const wrapper = el("div", "sitemap-groups");
    groups.forEach((group, i) => {
      const section = el("section", "sitemap-group");
      section.lang = group.code === "zh-cn" ? "zh-Hans" : group.code;
      const heading = el("div", "sitemap-group__heading");
      heading.append(el("p", "sitemap-group__eyebrow", `${String(i + 1).padStart(2, "0")} · ${group.code.toUpperCase()}`), el("h2", "", group.name));
      const entries = el("div", "sitemap-entries");
      for (const row of group.rows) {
        const entry = el("article", "sitemap-entry");
        const link = el("a", "sitemap-entry__link", row.loc.replace(/^https?:\/\/[^/]+/, "") || "/");
        const href = sameOrigin(row.loc);
        if (href) link.href = href; else link.setAttribute("aria-disabled", "true");
        entry.append(link, el("span", "sitemap-entry__date", row.date ? `Updated ${row.date}` : ""));
        entries.append(entry);
      }
      section.append(heading, entries);
      wrapper.append(section);
    });
    output.replaceChildren(wrapper);
  };

  const filterEntries = () => {
    const query = (search?.value || "").trim().toLocaleLowerCase();
    let visible = 0;
    output.querySelectorAll(".sitemap-group").forEach((group) => {
      let n = 0;
      group.querySelectorAll(".sitemap-entry").forEach((entry) => {
        const match = !query || entry.textContent.toLocaleLowerCase().includes(query) || group.textContent.toLocaleLowerCase().includes(query) && !query.includes("/");
        entry.hidden = !match;
        if (match) n += 1;
      });
      group.hidden = n === 0;
      visible += n;
    });
    if (search?.dataset.loaded === "true") {
      status.textContent = query ? `${visible} matching page${visible === 1 ? "" : "s"}.` : status.dataset.defaultText;
    }
  };

  const load = async () => {
    try {
      const index = await parse(indexUrl, "sitemapindex");
      const children = Array.from(index.getElementsByTagNameNS(ns, "sitemap")).map((n) => text(n, "loc")).filter(Boolean);
      const groups = [];
      for (const child of children) {
        const local = sameOrigin(child);
        if (!local) continue;
        const code = (local.match(/\/sitemaps\/([a-z-]+)\.xml$/) || [])[1] || "en";
        const doc = await parse(local, "urlset");
        const rows = Array.from(doc.getElementsByTagNameNS(ns, "url")).map((n) => ({ loc: text(n, "loc"), date: text(n, "lastmod") })).filter((r) => r.loc);
        groups.push({ code, name: LANGS[code] || code, rows });
      }
      render(groups);
      const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
      status.textContent = `Showing ${total} public URLs in ${groups.length} languages from the sitemap index.`;
      if (search) {
        search.dataset.loaded = "true";
        status.dataset.defaultText = status.textContent;
        search.addEventListener("input", filterEntries);
      }
    } catch (error) {
      status.textContent = "The visual sitemap could not be rendered. The raw XML sitemap is still available.";
      const link = el("a", "", "Open the raw XML sitemap index");
      link.href = "/sitemap.xml";
      output.replaceChildren(link);
      console.error("Ametherian sitemap viewer:", error);
    }
  };
  load();
})();

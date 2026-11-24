/* Ametherian visual sitemap: standards-based XML parsing and semantic DOM rendering. */
(() => {
  "use strict";
  const output = document.querySelector("[data-sitemap-output]");
  const status = document.querySelector("[data-sitemap-status]");
  const search = document.querySelector("[data-sitemap-search]");
  if (!output || !status) return;

  const sitemapUrl = new URL("../sitemap.xml", document.currentScript.src);
  const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const safeUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin && ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const render = (xmlDoc) => {
    const rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "url")).map((node) => ({
      loc: node.getElementsByTagNameNS(ns, "loc")[0]?.textContent?.trim() || "",
      date: node.getElementsByTagNameNS(ns, "lastmod")[0]?.textContent?.trim() || "",
    })).filter((row) => row.loc);
    const groups = [
      { title: "Website and policies", eyebrow: "01 · Project", rows: rows.filter((row) => !row.loc.includes("/docs/") && !row.loc.includes("/llms/")) },
      { title: "Documentation", eyebrow: "02 · Reference", rows: rows.filter((row) => row.loc.includes("/docs/")) },
      { title: "Discovery resources", eyebrow: "03 · Machine-readable", rows: rows.filter((row) => row.loc.includes("/llms/")) },
    ];
    const wrapper = el("div", "sitemap-groups");
    for (const group of groups) {
      if (!group.rows.length) continue;
      const section = el("section", "sitemap-group");
      const heading = el("div", "sitemap-group__heading");
      heading.append(el("p", "sitemap-group__eyebrow", group.eyebrow), el("h2", "", group.title));
      const entries = el("div", "sitemap-entries");
      for (const row of group.rows) {
        const entry = el("article", "sitemap-entry");
        const link = el("a", "sitemap-entry__link", row.loc);
        const href = safeUrl(row.loc);
        if (href) link.href = href;
        else link.setAttribute("aria-disabled", "true");
        entry.append(link, el("span", "sitemap-entry__date", row.date ? "Updated " + row.date : ""));
        entries.append(entry);
      }
      section.append(heading, entries);
      wrapper.append(section);
    }
    output.replaceChildren(wrapper);
    return rows.length;
  };
  const filterEntries = () => {
    const query = (search?.value || "").trim().toLocaleLowerCase();
    let visible = 0;
    output.querySelectorAll(".sitemap-group").forEach((group) => {
      let groupVisible = 0;
      group.querySelectorAll(".sitemap-entry").forEach((entry) => {
        const match = !query || entry.textContent.toLocaleLowerCase().includes(query);
        entry.hidden = !match;
        if (match) groupVisible += 1;
      });
      group.hidden = groupVisible === 0;
      visible += groupVisible;
    });
    if (search?.dataset.loaded === "true") {
      status.textContent = query ? visible + " matching page" + (visible === 1 ? "" : "s") + "." : status.dataset.defaultText;
    }
  };
  const load = async () => {
    try {
      const response = await fetch(sitemapUrl, { credentials: "same-origin", cache: "no-cache" });
      if (!response.ok) throw new Error("The XML sitemap could not be loaded.");
      const source = await response.text();
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("The sitemap contains a prohibited document type or entity declaration.");
      const xmlDoc = new DOMParser().parseFromString(source, "application/xml");
      if (xmlDoc.querySelector("parsererror") || xmlDoc.documentElement.localName !== "urlset") throw new Error("The sitemap is not valid sitemap XML.");
      const count = render(xmlDoc);
      status.textContent = "Showing " + count + " public URLs from the canonical XML sitemap.";
      if (search) {
        search.dataset.loaded = "true";
        status.dataset.defaultText = status.textContent;
        search.addEventListener("input", filterEntries);
      }
      filterEntries();
    } catch (error) {
      status.textContent = "The visual sitemap could not be rendered. The raw XML sitemap is still available.";
      const link = el("a", "", "Open raw XML sitemap");
      link.href = "../sitemap.xml";
      output.replaceChildren(link);
      console.error("Ametherian sitemap viewer:", error);
    }
  };
  load();
})();

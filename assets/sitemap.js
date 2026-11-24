/* Ametherian visual sitemap: XSLT 1.0 with a safe DOM fallback. */
(() => {
  "use strict";
  const output = document.querySelector("[data-sitemap-output]");
  const status = document.querySelector("[data-sitemap-status]");
  const search = document.querySelector("[data-sitemap-search]");
  if (!output || !status) return;

  const sitemapUrl = new URL("../sitemap.xml", document.currentScript.src);
  const stylesheetUrl = new URL("../sitemap.xsl", document.currentScript.src);
  const parseXml = (source, label) => {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(label + " contains a prohibited document type or entity declaration.");
    const parsed = new DOMParser().parseFromString(source, "application/xml");
    if (parsed.querySelector("parsererror")) throw new Error(label + " is not valid XML.");
    return parsed;
  };
  const safeUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin && ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const fallbackRender = (xmlDoc) => {
    const ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
    const rows = Array.from(xmlDoc.getElementsByTagNameNS(ns, "url")).map((node) => ({
      loc: node.getElementsByTagNameNS(ns, "loc")[0]?.textContent?.trim() || "",
      date: node.getElementsByTagNameNS(ns, "lastmod")[0]?.textContent?.trim() || "",
    }));
    const groups = [
      { title: "Website and policies", rows: rows.filter((row) => !row.loc.includes("/docs/")) },
      { title: "Documentation", rows: rows.filter((row) => row.loc.includes("/docs/")) },
    ];
    const wrapper = document.createElement("div");
    wrapper.className = "sitemap-groups";
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "sitemap-group";
      const heading = document.createElement("h2");
      heading.textContent = group.title;
      const entries = document.createElement("div");
      entries.className = "sitemap-entries";
      for (const row of group.rows) {
        const entry = document.createElement("article");
        entry.className = "sitemap-entry";
        const link = document.createElement("a");
        link.className = "sitemap-entry__link";
        link.textContent = row.loc;
        const href = safeUrl(row.loc);
        if (href) link.href = href;
        else link.setAttribute("aria-disabled", "true");
        const date = document.createElement("span");
        date.className = "sitemap-entry__date";
        date.textContent = row.date ? "Updated " + row.date : "";
        entry.append(link, date);
        entries.append(entry);
      }
      section.append(heading, entries);
      wrapper.append(section);
    }
    output.replaceChildren(wrapper);
    return rows.length;
  };
  const validateLinks = () => output.querySelectorAll("a[href]").forEach((link) => {
    const href = safeUrl(link.getAttribute("href") || "");
    if (href) link.href = href;
    else { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); }
  });
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
      const [xmlResponse, xslResponse] = await Promise.all([
        fetch(sitemapUrl, { credentials: "same-origin", cache: "no-cache" }),
        fetch(stylesheetUrl, { credentials: "same-origin", cache: "no-cache" }),
      ]);
      if (!xmlResponse.ok || !xslResponse.ok) throw new Error("The sitemap resources could not be loaded.");
      const [xmlText, xslText] = await Promise.all([xmlResponse.text(), xslResponse.text()]);
      const xmlDoc = parseXml(xmlText, "Sitemap");
      const xslDoc = parseXml(xslText, "Sitemap stylesheet");
      const count = xmlDoc.getElementsByTagNameNS("http://www.sitemaps.org/schemas/sitemap/0.9", "url").length;
      let transformed = false;
      if (typeof window.XSLTProcessor === "function") {
        if (typeof window.xsltPolyfillReady === "function") await window.xsltPolyfillReady();
        const processor = new window.XSLTProcessor();
        processor.importStylesheet(xslDoc);
        const fragment = processor.transformToFragment(xmlDoc, document);
        if (fragment) { output.replaceChildren(fragment); validateLinks(); transformed = true; }
      }
      if (!transformed) {
        fallbackRender(xmlDoc);
        status.textContent = "Showing " + count + " pages in the compatibility view.";
      } else {
        const engine = window.xsltPolyfillVersion ? "bundled XSLT 1.0 engine" : "browser XSLT engine";
        status.textContent = "Showing " + count + " public URLs · rendered with the " + engine + ".";
      }
      if (search) {
        search.dataset.loaded = "true";
        status.dataset.defaultText = status.textContent;
        search.addEventListener("input", filterEntries);
      }
      filterEntries();
    } catch (error) {
      status.textContent = "The visual sitemap could not be rendered. The raw XML sitemap is still available.";
      const link = document.createElement("a");
      link.href = "../sitemap.xml";
      link.textContent = "Open raw XML sitemap";
      output.replaceChildren(link);
      console.error("Ametherian sitemap viewer:", error);
    }
  };
  load();
})();

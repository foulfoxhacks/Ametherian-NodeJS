/* Ametherian site behaviour: menu, documentation search, copy button, TOC. */
(() => {
  "use strict";

  const doc = document;
  const header = doc.querySelector("[data-site-header]");
  const menuButton = doc.querySelector("[data-menu-button]");

  if (header && menuButton) {
    const closeMenu = () => {
      header.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    };

    menuButton.addEventListener("click", () => {
      const open = header.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", String(open));
    });

    header.querySelectorAll(".site-nav a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) closeMenu();
    });
  }

  const dialog = doc.querySelector("[data-search-dialog]");
  const input = doc.querySelector("[data-search-input]");
  const results = doc.querySelector("[data-search-results]");
  const status = doc.querySelector("[data-search-status]");
  const root = doc.body.dataset.root || "";
  const index = Array.isArray(window.AMETHERIAN_SEARCH) ? window.AMETHERIAN_SEARCH : [];
  let activeEntry = null;

  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const appendHighlighted = (element, text, regex) => {
    if (!regex) {
      element.textContent = text;
      return;
    }
    let last = 0;
    const source = String(text);
    source.replace(regex, (match, _group, offset) => {
      if (offset > last) element.append(source.slice(last, offset));
      const mark = doc.createElement("mark");
      mark.textContent = match;
      element.append(mark);
      last = offset + match.length;
      return match;
    });
    if (last < source.length) element.append(source.slice(last));
  };

  const snippetFor = (entry, terms) => {
    const text = entry.text || entry.description || "";
    const lower = normalize(text);
    let position = -1;
    for (const term of terms) {
      const found = lower.indexOf(term);
      if (found !== -1) {
        position = found;
        break;
      }
    }
    if (position === -1) return entry.description || text.slice(0, 160);
    const start = Math.max(0, position - 48);
    const end = Math.min(text.length, start + 170);
    return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
  };

  const buildResults = (query) => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const phrase = terms.join(" ");
    const found = [];

    for (const entry of index) {
      const title = normalize(entry.title);
      const description = normalize(entry.description);
      const text = normalize(entry.text);
      let pageScore = 0;

      if (title === phrase) pageScore += 120;
      else if (title.startsWith(phrase)) pageScore += 95;
      else if (title.includes(phrase)) pageScore += 70;
      if (description.includes(phrase)) pageScore += 28;
      if (text.includes(phrase)) pageScore += 16;

      for (const term of terms) {
        if (title.includes(term)) pageScore += 18;
        if (description.includes(term)) pageScore += 7;
        if (text.includes(term)) pageScore += 3;
      }

      if (pageScore > 0) {
        found.push({
          score: pageScore,
          path: entry.path,
          title: entry.title,
          section: entry.section,
          description: snippetFor(entry, terms),
          hash: "",
        });
      }

      for (const heading of entry.headings || []) {
        const headingText = normalize(heading.text);
        let headingScore = 0;
        if (headingText === phrase) headingScore += 110;
        else if (headingText.startsWith(phrase)) headingScore += 80;
        else if (headingText.includes(phrase)) headingScore += 50;
        for (const term of terms) {
          if (headingText.includes(term)) headingScore += 14;
        }
        if (headingScore > 0) {
          found.push({
            score: headingScore + 12,
            path: entry.path,
            title: heading.text,
            section: entry.title,
            description: entry.description,
            hash: heading.id,
          });
        }
      }
    }

    const seen = new Set();
    return found
      .sort((a, b) => b.score - a.score)
      .filter((item) => {
        const key = `${item.path}#${item.hash}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 14);
  };

  const renderSearch = (query) => {
    if (!results || !status) return;
    const trimmed = query.trim();
    results.replaceChildren();
    if (!trimmed) {
      status.hidden = false;
      status.textContent = "Type to search titles, sections, and descriptions.";
      results.hidden = true;
      return;
    }

    const terms = normalize(trimmed).split(/\s+/).filter(Boolean);
    const regex = terms.length
      ? new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi")
      : null;
    const matches = buildResults(trimmed);

    if (!matches.length) {
      status.hidden = false;
      status.textContent = `No matches for “${trimmed}”. Try a broader term.`;
      results.hidden = true;
      return;
    }

    status.hidden = false;
    status.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} for “${trimmed}”.`;
    for (const match of matches) {
      const item = doc.createElement("li");
      const link = doc.createElement("a");
      link.href = root + match.path + (match.hash ? `#${match.hash}` : "");

      const section = doc.createElement("span");
      section.className = "search-results__section";
      appendHighlighted(section, match.section, regex);

      const title = doc.createElement("span");
      title.className = "search-results__title";
      appendHighlighted(title, match.title, regex);

      const description = doc.createElement("span");
      description.className = "search-results__description";
      appendHighlighted(description, match.description, regex);

      link.append(section, title, description);
      link.addEventListener("click", () => {
        if (dialog && dialog.open) dialog.close();
      });
      item.append(link);
      results.append(item);
    }
    results.hidden = false;
  };

  const openSearch = (event) => {
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (event) event.preventDefault();
    activeEntry = event && event.currentTarget ? event.currentTarget : null;
    if (!dialog.open) dialog.showModal();
    if (input) {
      input.value = "";
      renderSearch("");
      window.setTimeout(() => input.focus(), 0);
    }
  };

  doc.querySelectorAll("[data-search-open]").forEach((button) => {
    button.addEventListener("click", openSearch);
  });

  if (dialog && input) {
    const closeButton = doc.querySelector("[data-search-close]");
    if (closeButton) {
      closeButton.addEventListener("click", () => dialog.close());
    }
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (activeEntry && typeof activeEntry.focus === "function") {
        activeEntry.focus();
      }
    });
    input.addEventListener("input", () => renderSearch(input.value));
  }

  doc.addEventListener("keydown", (event) => {
    if (!dialog) return;
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    const wantsSearch =
      (event.key === "/" && !typing) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k");
    if (wantsSearch) {
      event.preventDefault();
      openSearch(event);
    }
  });

  doc.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = doc.getElementById(button.dataset.copy || "");
      if (!target) return;
      const value = target.textContent || "";
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch {
        const selection = window.getSelection();
        if (selection) {
          const range = doc.createRange();
          range.selectNodeContents(target);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        button.textContent = "Selected";
      }
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1800);
    });
  });

  const tocLinks = Array.from(doc.querySelectorAll('.docs-toc a[href^="#"]')).filter(
    (link) => link.hash && link.hash !== "#main"
  );
  if (tocLinks.length) {
    const targets = tocLinks
      .map((link) => doc.getElementById(link.hash.slice(1)))
      .filter(Boolean);
    let ticking = false;

    const updateToc = () => {
      const marker = window.scrollY + 130;
      let active = targets[0];
      for (const target of targets) {
        if (target.getBoundingClientRect().top + window.scrollY <= marker) {
          active = target;
        }
      }
      const activeId = active ? `#${active.id}` : "";
      tocLinks.forEach((link) => {
        link.classList.toggle("is-active", link.hash === activeId);
      });
      ticking = false;
    };

    const requestToc = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateToc);
      }
    };

    window.addEventListener("scroll", requestToc, { passive: true });
    window.addEventListener("resize", requestToc);
    updateToc();
  }
})();

/* Theme switch (System -> Light -> Dark) and language menu. */
(() => {
  "use strict";
  const root = document.documentElement;
  const KEY = "ametherian-theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  const labels = { system: "Colour theme: system", light: "Colour theme: light", dark: "Colour theme: dark" };
  const stored = () => {
    try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
  };
  const apply = (mode) => {
    const resolved = mode === "system" ? (media && media.matches ? "light" : "dark") : mode;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", labels[mode]);
      button.title = labels[mode];
    });
  };
  apply(stored());
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-toggle]");
    if (!button) return;
    const next = { system: "light", light: "dark", dark: "system" }[stored()];
    try { next === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
    apply(next);
  });
  if (media && media.addEventListener) media.addEventListener("change", () => { if (stored() === "system") apply("system"); });

  // Close the language menu on outside click or Escape.
  document.addEventListener("click", (event) => {
    document.querySelectorAll("[data-lang-switch][open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute("open");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-lang-switch][open]").forEach((menu) => {
      menu.removeAttribute("open");
      menu.querySelector("summary")?.focus();
    });
  });
})();

/* Collapse the docs navigation on small screens so the page content comes first. */
(() => {
  const nav = document.querySelector("[data-docs-nav]");
  if (nav && window.matchMedia && window.matchMedia("(max-width: 860px)").matches) nav.removeAttribute("open");
})();

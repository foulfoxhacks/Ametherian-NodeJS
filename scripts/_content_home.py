FAQS = [
    (
        "Is Ametherian released?",
        'No. Ametherian is a public planning project. No Ametherian '
        'packages are published, and this site does not describe completed '
        'software. The <a href="docs/packages.html">package names</a> '
        'and capabilities are research directions.',
        "No. Ametherian is a public planning project. No Ametherian "
        "packages are published, and this site does not describe completed "
        "software. The package names and capabilities are research "
        "directions.",
    ),
    (
        "Is Ametherian affiliated with Node.js or the OpenJS Foundation?",
        "No. Ametherian is an independent project from FoulFoxHacks. It is not "
        "affiliated with, endorsed by, or an official continuation of Node.js, "
        "the OpenJS Foundation, Axios, Undici, or any other referenced project. "
        "Node.js is a trademark of the OpenJS Foundation.",
        "No. Ametherian is an independent project from FoulFoxHacks. It is not "
        "affiliated with, endorsed by, or an official continuation of Node.js, "
        "the OpenJS Foundation, Axios, Undici, or any other referenced project. "
        "Node.js is a trademark of the OpenJS Foundation.",
    ),
    (
        "Is Ametherian production-ready or audited?",
        "No. The planning repository makes no production-readiness or "
        "security-audit claim. The <a href=\"docs/security.html\">security "
        "approach</a> describes how future packages should be threat-modeled "
        "and reviewed; it is not a guarantee that any implementation is secure.",
        "No. The planning repository makes no production-readiness or "
        "security-audit claim. The security approach describes how future "
        "packages should be threat-modeled and reviewed; it is not a guarantee "
        "that any implementation is secure.",
    ),
    (
        "What runtime does Ametherian target?",
        "Node.js is the initial target, with JavaScript and TypeScript as the "
        "intended languages. Runtime assumptions, module formats, supported "
        "versions, and compatibility policy are not yet published and must be "
        "defined before stable packages.",
        "Node.js is the initial target, with JavaScript and TypeScript as the "
        "intended languages. Runtime assumptions, module formats, supported "
        "versions, and compatibility policy are not yet published and must be "
        "defined before stable packages.",
    ),
    (
        "What license will the project use?",
        "A license has not been selected. The "
        "<a href=\"LICENSE-STATUS.md\">licensing status</a> says maintainers "
        "should choose a license and define contribution and dependency "
        "policies before publishing implementation code. Do not assume this "
        "planning repository grants a license.",
        "A license has not been selected. The licensing status says maintainers "
        "should choose a license and define contribution and dependency "
        "policies before publishing implementation code. Do not assume this "
        "planning repository grants a license.",
    ),
    (
        "Can I contribute?",
        "Early feedback on scope, package boundaries, security requirements, "
        "runtime compatibility, and developer experience is welcome. The "
        "<a href=\"CONTRIBUTING.html\">contributing guide</a> explains "
        "expectations. Security-sensitive details must not be posted publicly; "
        "follow the <a href=\"SECURITY.html\">security policy</a>.",
        "Early feedback on scope, package boundaries, security requirements, "
        "runtime compatibility, and developer experience is welcome. The "
        "contributing guide explains expectations. Security-sensitive "
        "details must not be posted publicly; follow the security policy.",
    ),
    (
        "Is there a release timeline?",
        "No. The <a href=\"docs/roadmap.html\">roadmap</a> is staged and "
        "deliberately avoids dates until scope, ownership, and capacity are "
        "established. Release readiness requires an explicit API, support "
        "matrix, documentation, tests, security review, release process, and "
        "maintenance ownership.",
        "No. The roadmap is staged and deliberately avoids dates until scope, "
        "ownership, and capacity are established. Release readiness requires an "
        "explicit API, support matrix, documentation, tests, security review, "
        "release process, and maintenance ownership.",
    ),
    (
        "Does Ametherian replace Axios or Undici?",
        "No. Axios and Undici informed initial research into HTTP client "
        "ergonomics and transport architecture. Ametherian is not a drop-in "
        "replacement and makes no compatibility or performance claim without "
        "reproducible evidence.",
        "No. Axios and Undici informed initial research into HTTP client "
        "ergonomics and transport architecture. Ametherian is not a drop-in "
        "replacement and makes no compatibility or performance claim without "
        "reproducible evidence.",
    ),
]


def area_card(href: str, icon_name: str, title: str, description: str) -> str:
    return f"""<a class="area-card" href="{href}">
  <span class="area-card__icon">{icon(icon_name)}</span>
  <span>
    <h3>{title}</h3>
    <p>{description}</p>
  </span>
  <span class="area-card__arrow" aria-hidden="true">↗</span>
</a>"""


def principle_card(icon_name: str, title: str, description: str) -> str:
    return f"""<article class="principle">
  {icon(icon_name)}
  <h3>{title}</h3>
  <p>{description}</p>
</article>"""


def doc_map_item(current: str, target: str, label: str, description: str) -> str:
    return f"""<a href="{url_for(target, current)}">
  <span class="docs-map__label">{label}</span>
  <span class="docs-map__desc">{description}</span>
  <span class="docs-map__arrow" aria-hidden="true">↗</span>
</a>"""


def home_page() -> str:
    current = "index.html"
    faq_items = []
    for question, answer_html, _ in FAQS:
        faq_items.append(
            f'<details><summary>{esc(question)}</summary><p>{answer_html}</p></details>'
        )

    body = f"""<main id="main">
<section class="home-hero">
  <div class="shell hero-shell">
    <div class="hero-copy">
      <p class="eyebrow">Independent Node.js Ecosystem</p>
      <h1>A new kind of <span>Node library</span> ecosystem.</h1>
      <p class="hero-lead">Ametherian is a proposed family of modular JavaScript and TypeScript libraries under the <code>@foulfoxhacks</code> npm scope. The direction: focused packages, shared contracts, and security considered from the first design decision.</p>
      <div class="hero-actions">
        <a class="button button--primary" href="{url_for('docs/vision.html', current)}">Read the vision <span class="button__icon" aria-hidden="true">→</span></a>
        <a class="button button--ghost" href="{url_for('docs/packages.html', current)}">Explore packages</a>
      </div>
    </div>
    <div class="hero-brand">
      <div class="brand-card">
        <img class="brand-card__art" src="{url_for('assets/ametherian-mark-white.svg', current)}" alt="Ametherian symbol" width="260" height="261">
        <p class="brand-card__name">Ametherian</p>
        <p class="brand-card__tagline">A new kind of Node library ecosystem</p>
        <div class="brand-card__status">
          <p class="brand-card__status-label">Project status</p>
          <ul>
            <li><span>Packages</span><strong>Proposed</strong></li>
            <li><span>Implementations</span><strong>Not published</strong></li>
            <li><span>Security audit</span><strong>Not performed</strong></li>
          </ul>
        </div>
        <div class="brand-card__node">
          <img src="{url_for('assets/nodejs-hex.svg', current)}" alt="Node.js" width="44" height="50">
          <div><strong>Node.js-first</strong><span>JavaScript · TypeScript · npm</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="shell intro-grid">
    <div>
      <p class="eyebrow">Overview</p>
      <h2>One ecosystem. Independently adoptable tools.</h2>
    </div>
    <div class="intro-copy">
      <p>Node.js developers assemble networking, validation, caching, concurrency, observability, and application infrastructure from many packages. Ametherian investigates where consistent contracts and well-defined package boundaries could make that work easier to understand and maintain.</p>
      <p>Each future package should have a clear purpose, documented behavior, explicit limits, and the freedom to be adopted on its own. The ambition is broader than replacing a single HTTP client.</p>
      <a class="text-link" href="{url_for('docs/vision.html', current)}">Read the project vision <span aria-hidden="true">→</span></a>
    </div>
  </div>
</section>

<section class="section section--raised" id="ecosystem">
  <div class="shell">
    <div class="section-head">
      <div>
        <p class="eyebrow">Package Map</p>
        <h2>Five core areas.</h2>
      </div>
      <p class="section-intro">The package map is a research agenda. Each family describes work worth investigating. <a href="{url_for('docs/packages.html', current)}">Read the package map</a>.</p>
    </div>
    <div class="ecosystem-grid">
      {area_card(url_for('docs/packages.html#networking-and-protocols', current), 'network', 'Networking and protocols', 'HTTP clients, transports, connection pools, proxies, streaming, retries, deadlines, and cancellation.')}
      {area_card(url_for('docs/packages.html#data-and-serialization', current), 'data', 'Data and serialization', 'Validation, schemas, parsing, serialization, conversion, structured data, and safe handling of untrusted input.')}
      {area_card(url_for('docs/packages.html#application-infrastructure', current), 'layers', 'Application infrastructure', 'Caching, queues, concurrency, rate limiting, configuration, lifecycle management, and resilience.')}
      {area_card(url_for('docs/packages.html#security-engineering', current), 'shield', 'Security engineering', 'Security policy helpers, secure configuration, dependency review, test fixtures, and regression tooling.')}
      {area_card(url_for('docs/packages.html#observability-and-developer-experience', current), 'activity', 'Observability and developer experience', 'Logging, diagnostics, metrics, tracing, typed errors, test utilities, fuzzing helpers, and documentation tooling.')}
    </div>
  </div>
</section>

<section class="section" id="status">
  <div class="shell status-grid">
    <div class="status-copy">
      <p class="eyebrow">Current Status</p>
      <h2>Planning and Specification.</h2>
      <p>The repository is a public notice and planning site, not the implementation repository for completed packages. The status below is the honest baseline; anything beyond it needs published source, tests, and review.</p>
      <a class="text-link" href="{url_for('PROJECT_STATUS.md', current)}">Read the full project status <span aria-hidden="true">→</span></a>
    </div>
    <dl class="status-list">
      <div class="status-row"><dt>Current stage</dt><dd><span class="badge badge--proposed">Specification</span></dd></div>
      <div class="status-row"><dt>Package implementations</dt><dd><span class="badge badge--not">Not published</span></dd></div>
      <div class="status-row"><dt>Security audit</dt><dd><span class="badge badge--not">Not performed</span></dd></div>
      <div class="status-row"><dt>Project license</dt><dd><span class="badge badge--not">Not selected</span></dd></div>
      <div class="status-row"><dt>Documentation</dt><dd><span class="badge badge--proposed">Drafted</span></dd></div>
      <div class="status-row"><dt>Repository role</dt><dd><span class="badge">Planning site</span></dd></div>
    </dl>
  </div>
</section>

<section class="section section--raised">
  <div class="shell code-grid">
    <div class="code-copy">
      <p class="eyebrow">Architecture</p>
      <h2>Built on Node.js primitives.</h2>
      <p>Ametherian builds on the runtime’s established APIs rather than inventing a parallel way to write JavaScript. Compatibility and performance claims will need reproducible evidence before they are published.</p>
      <a class="text-link" href="{url_for('docs/architecture.html', current)}">Read the architecture direction <span aria-hidden="true">→</span></a>
    </div>
    <div class="code-window">
      <div class="code-bar">
        <span class="code-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="code-bar__file">server.mjs</span>
        <button class="copy-button" type="button" data-copy="node-example">Copy</button>
      </div>
      <pre><code id="node-example">import {{ createServer }} from 'node:http';

const server = createServer((request, response) => {{
  response.writeHead(200, {{ 'content-type': 'text/plain' }});
  response.end('Hello from Node.js\\n');
}});

server.listen(3000, () => {{
  console.log('Listening on http://localhost:3000');
}});</code></pre>
      <p class="code-note">Native Node.js example.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="shell docs-preview-grid">
    <div class="docs-preview-copy">
      <p class="eyebrow">Documentation</p>
      <h2>Project Documentation.</h2>
      <p>The documentation covers why the ecosystem exists, what it contains, and the constraints that determine whether a package can ship.</p>
      <a class="button button--primary" href="{url_for('docs/index.html', current)}">Open documentation <span class="button__icon" aria-hidden="true">→</span></a>
    </div>
    <div class="docs-map">
      {doc_map_item(current, 'docs/vision.html', 'Project vision', 'Why an ecosystem, what is in scope, and what the project will not promise.')}
      {doc_map_item(current, 'docs/packages.html', 'Package map', 'Five areas and the preview packages in each.')}
      {doc_map_item(current, 'docs/architecture.html', 'Architecture', 'Modular packages, shared contracts, runtime boundaries, and resource safety.')}
      {doc_map_item(current, 'docs/security.html', 'Security approach', 'Threat modeling, secure engineering practices, and vulnerability intelligence.')}
      {doc_map_item(current, 'docs/roadmap.html', 'Roadmap', 'The staged path from research to release readiness, without invented dates.')}
    </div>
  </div>
</section>

<section class="section section--raised">
  <div class="shell">
    <div class="section-head">
      <div>
        <p class="eyebrow">Guiding Principles</p>
        <h2>Development guidelines.</h2>
      </div>
      <p class="section-intro">These principles are requirements for future work, not evidence that the work is complete. They apply to package boundaries, documentation, tests, and review.</p>
    </div>
    <div class="principles-grid">
      {principle_card('package', 'Focused packages', 'A package should have one understandable responsibility and remain useful without unrelated modules.')}
      {principle_card('document', 'Explicit behavior', 'Runtime requirements, side effects, limits, failure modes, and data handling should be documented rather than hidden.')}
      {principle_card('plug', 'Interoperability', 'Learn from established libraries, interoperate where useful, and avoid unnecessary reinvention.')}
      {principle_card('flask', 'Evidence over claims', 'Compatibility, performance, security, and reliability statements need reproducible tests or a clear label as goals.')}
      {principle_card('shield', 'Security by design', 'Threat models, bounded resources, and safe defaults belong in the design, not in a later checklist.')}
      {principle_card('people', 'Human-reviewed change', 'Security-sensitive fixes and public claims require review by people accountable for the result.')}
    </div>
  </div>
</section>

<section class="section faq-section">
  <div class="shell">
    <div class="section-head">
      <div>
        <p class="eyebrow">FAQ</p>
        <h2>About the project.</h2>
      </div>
      <p class="section-intro">Direct answers about status, affiliation, runtime, licensing, and contribution.</p>
    </div>
    <div class="faq-list">
      {''.join(faq_items)}
    </div>
  </div>
</section>

<section class="cta-section">
  <div class="shell">
    <div class="cta-panel">
      <div>
        <p class="eyebrow">Get Started</p>
        <h2>Read the Documentation.</h2>
        <p>Start with the vision, then check the package map, architecture, security approach, and roadmap.</p>
      </div>
      <div class="cta-panel__actions">
        <a class="button button--primary" href="{url_for('docs/vision.html', current)}">Start reading</a>
        <a class="button button--ghost" href="{REPO}" target="_blank" rel="noopener noreferrer">View on GitHub <span aria-hidden="true">↗</span></a>
      </div>
    </div>
  </div>
</section>
</main>"""
    return site_shell(current, body, FAQS)
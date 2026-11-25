"""Page content for the Ametherian site."""

from .common import *

FAQS = [
    (
        "Is Ametherian released?",
        'Not to npm yet. The <a href="/modules/">preview packages</a> are '
        'public in the repository with tests, and every green build is '
        'published as a numbered preview on GitHub Releases. Publishing to npm '
        'waits for an agreed release process.',
        "Not to npm yet. The preview packages are public in the repository "
        "with tests, and every green build is published as a numbered preview "
        "on GitHub Releases. Publishing to npm waits for an agreed release "
        "process.",
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
        "No. The packages exist as tested previews, but none is published to "
        "npm and no independent security audit has been performed. The "
        "<a href=\"/docs/security/\">security approach</a> and the vulnerability "
        "model describe how the code is threat-modelled and tested; they are "
        "not a guarantee that it is secure.",
        "No. The packages exist as tested previews, but none is published to "
        "npm and no independent security audit has been performed. The "
        "security approach and the vulnerability model describe how the code "
        "is threat-modelled and tested; they are not a guarantee that it is "
        "secure.",
    ),
    (
        "What runtime does Ametherian target?",
        "Node.js 22, 24 and 26, each at its latest security release. Packages "
        "are ES modules with TypeScript declarations. Node.js 20 is not "
        "supported: it reached end of life in April 2026.",
        "Node.js 22, 24 and 26, each at its latest security release. Packages "
        "are ES modules with TypeScript declarations. Node.js 20 is not "
        "supported: it reached end of life in April 2026.",
    ),
    (
        "What license will the project use?",
        "The Apache License 2.0. It is a permissive license with an explicit "
        "patent grant. The full text is in the "
        "<a href=\"LICENSE-STATUS.md\">licensing status</a> and in every package.",
        "The Apache License 2.0. It is a permissive license with an explicit "
        "patent grant. The full text is in the licensing status and in every "
        "package.",
    ),
    (
        "Can I contribute?",
        "Early feedback on scope, package boundaries, security requirements, "
        "runtime compatibility, and developer experience is welcome. The "
        "<a href=\"/contributing/\">contributing guide</a> explains "
        "expectations. Security-sensitive details must not be posted publicly; "
        "follow the <a href=\"/security/\">security policy</a>.",
        "Early feedback on scope, package boundaries, security requirements, "
        "runtime compatibility, and developer experience is welcome. The "
        "contributing guide explains expectations. Security-sensitive "
        "details must not be posted publicly; follow the security policy.",
    ),
    (
        "Is there a release timeline?",
        "There are no dates. Every build of the main branch that passes CI is "
        "published as a numbered preview build on GitHub Releases, listed in "
        "the <a href=\"/changelog/\">changelog</a>. Publishing to npm waits for "
        "an agreed release process.",
        "There are no dates. Every build of the main branch that passes CI is "
        "published as a numbered preview build on GitHub Releases, listed in "
        "the changelog. Publishing to npm waits for an agreed release "
        "process.",
    ),
    (
        "Does Ametherian replace Axios or Undici?",
        "No. The Ametherian HTTP client and fetch() are its own code, checked "
        "against every published Axios and Undici advisory. It is not a "
        "drop-in replacement and makes no compatibility or performance claim "
        "without reproducible evidence.",
        "No. The Ametherian HTTP client and fetch() are its own code, checked "
        "against every published Axios and Undici advisory. It is not a "
        "drop-in replacement and makes no compatibility or performance claim "
        "without reproducible evidence.",
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
      <p class="hero-lead">Ametherian is a family of modular JavaScript and TypeScript libraries under the <code>@foulfoxhacks</code> npm scope. Its packages exist as tested previews: focused packages, shared contracts, and security considered from the first design decision.</p>
      <div class="hero-actions">
        <a class="button button--primary" href="{url_for('docs/vision.html', current)}">Read the vision <span class="button__icon" aria-hidden="true">→</span></a>
        <a class="button button--ghost" href="{url_for('modules/index.html', current)}">Explore the modules</a>
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
            <li><span>Packages</span><strong>In preview</strong></li>
            <li><span>npm release</span><strong>Not published</strong></li>
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
      <p>Each package has a clear purpose, documented behavior, explicit limits, and the freedom to be adopted on its own. The ambition is broader than replacing a single HTTP client.</p>
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
      <p class="section-intro">Each family now has preview packages with tests and threat models. <a href="{url_for('modules/index.html', current)}">See the modules</a>.</p>
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
      <h2>Preview implementation.</h2>
      <p>The packages are implemented as previews in this repository, with tests, type declarations and threat models. They are licensed under Apache 2.0, not yet published to npm, and not audited. Anything beyond this needs evidence.</p>
      <a class="text-link" href="{url_for('PROJECT_STATUS.md', current)}">Read the full project status <span aria-hidden="true">→</span></a>
    </div>
    <dl class="status-list">
      <div class="status-row"><dt>Current stage</dt><dd><span class="badge badge--proposed">Preview</span></dd></div>
      <div class="status-row"><dt>Package implementations</dt><dd><span class="badge badge--proposed">Preview packages</span></dd></div>
      <div class="status-row"><dt>npm release</dt><dd><span class="badge badge--not">Not published</span></dd></div>
      <div class="status-row"><dt>Security audit</dt><dd><span class="badge badge--not">Not performed</span></dd></div>
      <div class="status-row"><dt>Project license</dt><dd><span class="badge badge--proposed">Apache 2.0</span></dd></div>
      <div class="status-row"><dt>Documentation</dt><dd><span class="badge badge--proposed">Published</span></dd></div>
      <div class="status-row"><dt>Repository role</dt><dd><span class="badge">Code and site</span></dd></div>
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
      {doc_map_item(current, '/docs/security/', 'Security approach', 'Threat modeling, secure engineering practices, and vulnerability intelligence.')}
      {doc_map_item(current, '/docs/roadmap/', 'Roadmap', 'The staged path from research to release readiness, without invented dates.')}
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
      <p class="section-intro">These principles are requirements for every package; tests, threat models and review check them. They apply to package boundaries, documentation, tests, and review.</p>
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
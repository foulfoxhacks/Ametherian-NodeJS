# @foulfoxhacks/ametherian-minification

**Status: unpublished preview.** Not audited; API may change.

Ametherian's bounded minification orchestration layer, split into two public submodules: `javascript` for JavaScript and `cascade` for CSS and its cascade-aware parser pipeline.

## Engine design

This package deliberately does not implement JavaScript or CSS parsing with regular expressions. Correct minification requires grammar-aware parsing and transformations. A home-grown tokenizer or regex cleanup can corrupt strings, template literals, automatic semicolon insertion, selectors, custom properties, at-rules, or cascade order.

Ametherian owns the API contract, profiles, input/output bounds, result validation, statistics, and build integration. A caller injects a maintained parser/minifier engine. This keeps the core package free of third-party runtime dependencies while allowing vetted engines such as esbuild and Lightning CSS to be used without unsafe compatibility shims.

## Usage

Import transform functions from parser engines and inject them into the Ametherian adapters:

```js
import * as esbuild from 'esbuild';
import * as lightningcss from 'lightningcss';
import { createMinificationEngine, createJavaScriptMinifier, createCascadeMinifier } from '@foulfoxhacks/ametherian-minification';

const engine = createMinificationEngine({
  javascript: createJavaScriptMinifier({ transform: esbuild.transform }),
  cascade: createCascadeMinifier({ transform: lightningcss.transform }),
});

const js = await engine.minifyJavaScript(sourceJs, { level: 'standard', target: 'es2022', sourceMap: true });
const css = await engine.minifyCascade(sourceCss, { filename: 'site.css', sourceMap: true });
```

Install and pin parser engines in the consuming build. Review their licenses, provenance, lockfile integrity, NVD/OSV advisories, and CISA KEV status before use. Ametherian does not download or execute a compiler binary on behalf of the caller.

## Profiles

JavaScript supports `conservative` (whitespace-only, no syntax compression or identifier mangling) and `standard` (parser-backed whitespace, syntax, and identifier minification). There is intentionally no maximum or unsafe profile. Console stripping, debugger stripping, property mangling, global defines, dead-code assumptions, and arbitrary user transforms are not enabled.

Cascade uses the injected CSS engine's standards-aware minifier. It does not perform document-specific selector purging, stylesheet concatenation, asset fingerprinting, or URL rewriting. Those are delivery concerns and belong in a separate Ametherian delivery package.

## Safety contract

- Source must be a string and is byte-counted before parsing.
- Default source limit: 8 MiB. Default output and source-map limits: 16 MiB each.
- Engine output must be valid UTF-8 text; malformed or oversized results are rejected.
- Errors are wrapped in typed Ametherian minification errors.
- No input file is read, no output file is written, and no dependency is installed by this package.
- Source maps are opt-in and returned separately.
- Minification is not a sanitizer. It does not replace escaping, CSP, validation, or secure templating.
- A successful result is not proof of semantic equivalence. Integrators must run application tests and browser regression checks.

Run `npm test --workspace @foulfoxhacks/ametherian-minification` from the Ametherian workspace.

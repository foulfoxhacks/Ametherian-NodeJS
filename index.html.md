# Ametherian

> A new kind of Node library ecosystem: modular developer tools designed around clear interfaces, security-conscious defaults, and maintainable engineering.

Ametherian is a proposed, community-oriented family of JavaScript and TypeScript libraries under the `@foulfoxhacks` npm scope. The project direction is broader than an HTTP client: it explores a coherent ecosystem for networking, data handling, application infrastructure, developer tooling, and security engineering.

**Project status:** Public proposal and planning repository. The packages, APIs, security controls, compatibility claims, and roadmap described here are proposed work unless explicitly marked otherwise. This repository does not claim that Ametherian is implemented, audited, production-ready, or a drop-in replacement for existing packages.

## What Ametherian is intended to become

Ametherian aims to make commonly repeated infrastructure work easier to compose and safer to maintain. Rather than building one oversized dependency, the project is intended to grow as a set of focused packages with shared conventions, documented boundaries, consistent errors, compatibility expectations, and security practices.

The initial research began with the capabilities and design approaches of Axios and Undici. The broader direction is to study and serve a wider range of everyday and specialist developer needs, including:

- HTTP clients, transports, proxies, connection pools, and streaming
- Input validation, schemas, serialization, parsing, and data conversion
- Authentication integrations, authorization helpers, and secure configuration
- Caching, queues, concurrency, retries, rate limits, and resilience
- Logging, diagnostics, metrics, tracing, and observability
- Testing utilities, mocks, fixtures, fuzzing helpers, and test environments
- Filesystem, process, environment, CLI, and runtime utilities
- Database adapters and data-access building blocks
- Protocol integrations and interoperability utilities
- Build, release, dependency, and supply-chain security tooling

These are areas of investigation, not a statement that every capability already exists or will necessarily ship.

## Project principles

**Security is an engineering requirement.** Security controls should be designed into package boundaries, reviewed as part of feature work, and tested against realistic misuse and failure cases.

**Small packages, shared standards.** A developer should be able to install a focused module without pulling in an entire ecosystem. Shared types and contracts should reduce fragmentation without creating circular dependencies.

**Explicit behavior.** Defaults, runtime requirements, side effects, data handling, and failure modes should be documented. Ametherian should not hide unsupported capabilities behind silent fallbacks.

**Evidence over claims.** Compatibility, performance, security, and reliability statements must be backed by reproducible tests or clearly labeled as goals.

**Respect existing projects.** Ametherian should learn from established libraries, interoperate with them where useful, and avoid unnecessary reinvention. Reuse must respect licenses, attribution, and upstream security guidance.

## Package naming

The proposed npm namespace is `@foulfoxhacks`. Example package names:

```bash
npm install @foulfoxhacks/ametherian
npm install @foulfoxhacks/ametherian-http
npm install @foulfoxhacks/ametherian-security
```

The package list is a naming proposal. Availability, ownership, publication, and package contents must be verified before any package is announced as released.

## Current repository status

This repository is the public project notice, vision, and documentation starting point. It is not the implementation repository for completed packages. The roadmap is intentionally staged: research and specifications come before implementation claims.

See the [project vision](docs/vision.md), [architecture direction](docs/architecture.md), [security approach](docs/security.md), [package map](docs/packages.md), and [roadmap](docs/roadmap.md).

## Participation

Early feedback is welcome on project scope, package boundaries, security requirements, runtime compatibility, and developer experience. Please use GitHub Discussions or Issues once those features are enabled in the repository. Security-sensitive reports should follow the process in [SECURITY.md](SECURITY.md), not be posted as public exploit details.

## Important notice

Ametherian is not affiliated with, endorsed by, or an official continuation of Axios, Undici, Node.js, OpenJS, or any other project referenced in its research. Names of third-party projects are used only to identify technologies and compatibility areas under consideration.
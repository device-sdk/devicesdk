# Contributing to DeviceSDK

DeviceSDK is free, open-source, and self-hosted. We welcome contributions - bug
fixes, features, documentation, firmware improvements, and issue reports.

This guide covers how to get started, the conventions we follow, and how to open
a pull request.

## Table of contents

- [Prerequisites](#prerequisites)
- [Repository layout](#repository-layout)
- [Development workflow](#development-workflow)
- [Linting and type checking](#linting-and-type-checking)
- [Tests](#tests)
- [Changesets](#changesets)
- [Opening a pull request](#opening-a-pull-request)
- [License](#license)

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 9.x
- [Bun](https://bun.sh/) 1.3.14+ (server runtime only)

## Repository layout

This is a pnpm + Turborepo monorepo:

| Path | Package | Purpose |
|---|---|---|
| `apps/server` | `@devicesdk/server` | Bun backend: REST API, device WebSockets, dashboard hosting |
| `apps/dashboard` | `@devicesdk/dashboard` | Vue 3 + Quasar dashboard SPA |
| `apps/website` | `@devicesdk/website` | Vue 3 + Vite SSG marketing and docs site |
| `apps/simulation` | `@devicesdk/simulation` | CLI dev simulator UI |
| `packages/core` | `@devicesdk/core` | Shared types and `DeviceEntrypoint` base class (published to npm) |
| `packages/cli` | `@devicesdk/cli` | `devicesdk` CLI (published to npm) |
| `packages/mcp` | `@devicesdk/mcp` | Model Context Protocol server (published to npm) |
| `packages/typescript-config` | `@repo/typescript-config` | Shared tsconfig base |
| `firmware/esp32`, `firmware/pico` | - | ESP32 / Pico W firmware |
| `examples/*` | - | Example device projects |

The canonical developer guide is [`AGENTS.md`](./AGENTS.md). Read it before
making non-trivial changes, especially for server endpoints, the database layer,
firmware, or Vue components.

## Development workflow

1. Fork the repository and create a feature branch. Do not commit directly to
   `main`.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the workspace:
   ```bash
   pnpm build
   ```
4. Run the server and dashboard locally:
   ```bash
   pnpm local
   ```
   The server starts on `http://localhost:8080`. The first account you register
   becomes the admin.

## Linting and type checking

We use Biome for TypeScript/JSON in `apps/server`, `apps/simulation`,
`packages/core`, and `packages/cli`; ESLint for `apps/dashboard`; and `tsc` for
type checking across the workspace.

Before committing, run:

```bash
pnpm lint
pnpm check-types
```

Fix any failures. The repo includes a husky + lint-staged pre-commit hook that
runs the relevant linters automatically.

## Tests

Server tests run on Bun, CLI tests on Vitest, and dashboard tests on Vitest +
Playwright.

```bash
# Server unit tests
pnpm test --filter @devicesdk/server

# CLI unit tests
pnpm test --filter @devicesdk/cli

# Dashboard component tests
pnpm test:unit --filter @devicesdk/dashboard

# Dashboard E2E tests
pnpm test:e2e --filter @devicesdk/dashboard
```

Add tests alongside the code you change when possible.

## Changesets

User-visible changes require a changeset. We use `@changesets/cli` to manage
versions and changelogs.

Create a changeset early in your branch:

```bash
pnpm changeset
```

Select every workspace package your change touches. The changeset "Version
packages" PR will bump versions and update `CHANGELOG.md` files automatically.

Never set a `major` version bump without explicit maintainer approval.

## Opening a pull request

1. Make sure your branch is up to date with `origin/main`.
2. Run `pnpm lint`, `pnpm check-types`, and the relevant tests.
3. Include a changeset if the change is user-visible.
4. Open a pull request against `main` with a clear description of the change,
   the motivation, and any testing you performed.
5. Keep the change focused and minimal. If you are fixing multiple unrelated
   issues, consider separate pull requests.

## License

By contributing to DeviceSDK, you agree that your contributions will be
licensed under the [AGPL-3.0-only](./LICENSE) license.

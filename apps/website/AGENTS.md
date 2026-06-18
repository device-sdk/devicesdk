# apps/website — Agent Guide

This file provides guidance to AI coding agents (OpenCode, Claude Code, Cursor,
etc.) when working in the DeviceSDK marketing and documentation website.

## Stack

The site is a Vue 3 + TypeScript SPA built with **vite-ssg** and
**vite-plugin-pages** for file-based routing:

- `src/pages/*.vue` — marketing pages (dark theme).
- `src/pages/docs/[...slug].vue` — documentation renderer (light theme).
- `src/pages/architecture/*.vue` — architecture deep-dives with D3 diagrams.
- `src/components/` — design system and layout components.
- `src/styles/main.css` — Tailwind 4 entry + component utilities.
- `scripts/prebuild.ts` — generates docs routes/index, sitemap, `llms.txt`,
  `robots.txt`, agent-skills manifest, copies OpenAPI JSON, and renders OG
  images with Playwright.
- `static/` — static assets copied into `public/` during prebuild
  (`_redirects`, `_headers`, `.well-known`, `logo.svg`, etc.).
- `public/` — generated build-time public directory.
- `dist/` — final static output.

Build command: `pnpm build` (runs `scripts/prebuild.ts` then `vite-ssg build`).

## Public-facing content rule (inherits from root AGENTS.md)

DeviceSDK is **free, open-source (AGPL-3.0), and self-hosted** — there is no
managed cloud. Public-facing copy under `content/`, `src/pages/`, and
`docs/public/` must describe the self-hosted reality:

- The server is a single **Bun** process the user runs on their own hardware
  (Raspberry Pi, NUC, NAS, any Docker host), serving the API, device WebSockets,
  and the dashboard on one port (default `8080`). Device scripts run
  **in-process** on that server.
- Do **not** describe a "managed edge runtime", "serverless runtime", "globally
  distributed runtime", "managed platform", pricing, sign-up/early-access, or a
  hosted `dash.devicesdk.com` / `api.devicesdk.com`. None of those exist anymore.
- Also never reference the old Cloudflare stack (Workers, D1, R2, Durable
  Objects, KV, Wrangler, Pages) — the Cloudflare-hosted era is over.

## Motion / animation vocabulary

Reusable CSS utilities live in `src/styles/main.css`. Prefer them over one-off
keyframes so the site stays visually cohesive and respects
`prefers-reduced-motion`.

- `.reveal` — fade + rise 28px on scroll. Add `data-reveal="left|right|scale"`
  to vary direction.
- `.reveal-stagger` — parent class; direct children animate in sequence
  (70 ms step, capped at 9).
- `.hero-enter` — first-paint stagger for hero copy (no IntersectionObserver).
- `.hero-mesh` / `.hero-mesh.subtle` — drifting gradient orbs behind a hero.
- `.gradient-pan` — animated emerald gradient text (use sparingly).
- `.pulse-soft` — radiating halo for live/beta indicators.
- `.card-lift` — lifts a card 3 px with emerald-tinted shadow on hover.
- `.btn-primary` — emerald button with shimmer on hover.
- `.nudge` — CTA; inline arrow nudges 3 px right on hover.
- `.link-underline` — animated underline grows from the left on hover.

## OG Image Generation

The site uses Playwright to render social-preview images during build. `pnpm
build` requires `pnpm exec playwright install` to have run at least once. CI
caches the Playwright browsers between runs.

## URL changes require a redirect

Whenever you rename, move, or delete a documentation file under `docs/public/`
or a marketing page under `src/pages/`, you **MUST** add a 301 entry to
`apps/website/static/_redirects` mapping the old URL to the new one (or to the
closest still-existing parent for deletions).

This applies even for "small" reorganizations. Google retains old URLs for
months and continues serving them from the index — a missing redirect costs
impressions and trips canonical/404 warnings in Search Console.

**Format:** `<old-path> <new-path> 301`, one per line. Wildcards work:
`/docs/old-section/:slug /docs/new-section/:slug 301`. Place the more specific
entries before the general ones.

**Verify after deploy:** `curl -I https://devicesdk.com/<old-path>` should
return `HTTP/2 301` with the new `location:` header.

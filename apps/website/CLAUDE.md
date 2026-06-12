# apps/website — guidance

This file provides guidance to Claude Code (claude.ai/code) when working in the website Hugo project.

## Empty Section Pages

The following content files contain front-matter only — **this is intentional**, not an oversight:

- `content/product/_index.md`
- `content/about/_index.md`
- `content/community/_index.md`
- `content/examples/_index.md`
- `content/solutions/_index.md`

Each one is rendered by a custom Hugo layout in `layouts/<section>/<section>.html` (e.g. `layouts/product/product.html`). The layouts hard-code the page content in HTML/Tailwind markup; they do not render `{{ .Content }}`.

**Writing markdown in the body of an empty `_index.md` will NOT appear in the built site.** If you need to change the text of one of these pages, edit the matching HTML layout instead.

Pages that DO use markdown bodies (for comparison): `content/privacy/_index.md` and `content/terms/_index.md` — the corresponding layouts (`layouts/privacy/privacy.html`, `layouts/terms/terms.html`) call `{{ .Content }}` and `{{ .TableOfContents }}`.

## Public-facing content rule (inherits from root CLAUDE.md)

DeviceSDK is now **free, open-source (AGPL-3.0), and self-hosted** — there is no managed cloud. Public-facing copy under `content/`, `layouts/`, and `docs/public/` (mounted into the Hugo content tree at build time — see `[[module.mounts]]` in `hugo.toml`) must describe the self-hosted reality:

- The server is a single **Bun** process the user runs on their own hardware (Raspberry Pi, NUC, NAS, any Docker host), serving the API, device WebSockets, and the dashboard on one port (default `8080`). Device scripts run **in-process** on that server.
- Do **not** describe a "managed edge runtime", "serverless runtime", "globally distributed runtime", "managed platform", pricing, sign-up/early-access, or a hosted `dash.devicesdk.com` / `api.devicesdk.com`. None of those exist anymore.
- Also never reference the old Cloudflare stack (Workers, D1, R2, Durable Objects, KV, Wrangler, Pages) — the Cloudflare-hosted era is over.

## Motion / animation vocabulary

A small set of CSS-only motion utilities lives in `layouts/partials/head.html`. Use them instead of inventing one-off keyframes — keeps the site visually cohesive and respects `prefers-reduced-motion` automatically.

- `.fade-up` — *legacy*, still works. Fades + rises 20px when scrolled into view. Toggled by the IntersectionObserver in `_default/baseof.html`.
- `.reveal` — modern replacement for `.fade-up`. Larger displacement (28px), slower easing. Add `data-reveal="left|right|scale"` to vary the direction.
- `.reveal-stagger` — apply to a parent; its direct children animate in sequence (70ms step, capped at 9). Use for grids, lists, and "reveal a sequence" moments. Nest under a `.reveal` if both the container and items should animate.
- `.hero-enter` — first-paint stagger (no IntersectionObserver). Apply to a hero copy block to fade-and-rise its children on load.
- `.hero-mesh` — drifting blurred gradient orbs behind a hero. Wrap in `<section class="relative overflow-hidden">` and add a sibling `<div class="hero-mesh subtle" aria-hidden="true"></div>`. Place hero content inside `.hero-stack` so it sits above the mesh.
- `.gradient-pan` — animated emerald gradient text. Use sparingly — typically the second line of an h1 (the accent phrase).
- `.pulse-soft` — a halo that radiates out from a small dot. Great for "live" / beta indicators. The dot itself is a separate sibling element.
- `.card-lift` — lifts a card 3px with an emerald-tinted shadow on hover. Compose with `.card` (`class="card card-lift"`) or use standalone on any bordered surface.
- `.btn-primary` — already has a sweeping shimmer on hover. No extra class needed.
- `.nudge` — for CTAs; pairs with an inline `<svg>` arrow to nudge the arrow 3px right on hover.
- `.link-underline` — animated underline that grows from the left on hover.
- `.float` — gentle 4px vertical drift loop. Use sparingly on a single element near a hero.

The IntersectionObserver in `layouts/_default/baseof.html` handles `.fade-up`, `.reveal`, and `.reveal-stagger` together — you only need to add classes; no per-page wiring required.

## OG Image Generation

The site uses Playwright to render social-preview images during build. `pnpm build` requires `pnpm exec playwright install` to have run at least once. CI caches the Playwright browsers between runs.

## URL changes require a redirect

Whenever you rename, move, or delete a content file under `content/` or `docs/public/` (which mounts at `/docs/`), you **MUST** add a 301 entry to `apps/website/static/_redirects` mapping the old URL to the new one (or to the closest still-existing parent for deletions).

This applies even for "small" reorganizations. Google retains old URLs for months and continues serving them from the index — a missing redirect costs impressions and trips canonical/404 warnings in Search Console. We've already paid for this once: `/docs/resources/hardware/` was moved to `/docs/hardware/` without a redirect, leading to ~36 wasted impressions per quarter and a "duplicate without canonical" warning.

**Format:** `<old-path> <new-path> 301`, one per line. Wildcards work: `/docs/old-section/:slug /docs/new-section/:slug 301`. Place the more specific entries before the general ones.

**Verify after deploy:** `curl -I https://devicesdk.com/<old-path>` should return `HTTP/2 301` with the new `location:` header.

Also applies to: changes to `permalink`/`url` in front-matter, changes to `[permalinks]` in `hugo.toml`, and changes to `[[module.mounts]]` `target` values that shift where content lands in the URL tree.

# apps/website — guidance

This file provides guidance to Claude Code (claude.ai/code) when working in the website Hugo project.

## Empty Section Pages

The following content files contain front-matter only — **this is intentional**, not an oversight:

- `content/product/_index.md`
- `content/pricing/_index.md`
- `content/about/_index.md`
- `content/community/_index.md`
- `content/examples/_index.md`
- `content/solutions/_index.md`
- `content/early-access/_index.md`

Each one is rendered by a custom Hugo layout in `layouts/<section>/<section>.html` (e.g. `layouts/product/product.html`). The layouts hard-code the page content in HTML/Tailwind markup; they do not render `{{ .Content }}`.

**Writing markdown in the body of an empty `_index.md` will NOT appear in the built site.** If you need to change the text of one of these pages, edit the matching HTML layout instead.

Pages that DO use markdown bodies (for comparison): `content/privacy/_index.md` and `content/terms/_index.md` — the corresponding layouts (`layouts/privacy/privacy.html`, `layouts/terms/terms.html`) call `{{ .Content }}` and `{{ .TableOfContents }}`.

## Public-facing content rule (inherits from root CLAUDE.md)

Never reference Cloudflare, Workers, D1, R2, Durable Objects, KV, Wrangler, or Pages in any file under `content/`, `layouts/`, or `docs/public/` (mounted into the Hugo content tree at build time — see `[[module.mounts]]` in `hugo.toml`). Use the generic terms listed in the root `CLAUDE.md` (`managed edge runtime`, `edge infrastructure`, `globally distributed runtime`, `managed platform`).

Internal runbooks live under `docs/internal/` and are **not** mounted into the Hugo build, so they may reference Cloudflare freely.

## OG Image Generation

The site uses Playwright to render social-preview images during build. `pnpm build` requires `pnpm exec playwright install` to have run at least once. CI caches the Playwright browsers between runs.

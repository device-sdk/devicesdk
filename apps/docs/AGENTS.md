# apps/docs - Agent Guide

This app hosts the DeviceSDK documentation site at `https://docs.devicesdk.com` using [Nimbus](https://nimbus-docs.com) (Astro-based docs framework). It is a separate Cloudflare Workers static site from the main marketing website in `apps/website`.

## Important context

- **Phase 1 / dual-run.** `docs/public` is still the source of truth for `devicesdk.com/docs` (via `apps/website`) and for the server's docs FTS index. Content in this app is currently an independent copy. Do not edit `docs/public` from here unless explicitly asked.
- **URLs drop the `/docs/` prefix.** On this subdomain, `/docs/quickstart/` becomes `/quickstart/`. Internal links in `src/content/docs/**/*.md` must use `/quickstart/` style paths.
- **Deploy is gated by version packages.** `.github/workflows/docs-deploy.yml` only auto-deploys when the release PR with commit subject `chore: version packages` merges, or on manual dispatch.

## File layout

```
apps/docs/
  astro.config.ts              # nimbus config, sidebar, site metadata
  wrangler.jsonc               # devicesdk-docs worker, docs.devicesdk.com route
  src/
    components.ts              # MDX globals registry
    components/                # Header, AgentDirective, ui/<slug>/
    content/
      docs/*.md                # migrated doc pages (and future pages)
      partials/*.mdx           # reusable snippets rendered via <Render file="..." />
    content.config.ts          # docsCollection() + partialsCollection()
    layouts/                   # BaseLayout, DocsLayout
    pages/
      index.astro              # custom root page rendering docs/index.md
      [...slug].astro          # catch-all doc route
      [...slug]/index.md.ts    # per-page markdown alternate
      llms.txt.ts
      robots.txt.ts
      og.png.ts / og/[...slug].ts
    styles/                    # globals.css, prose.css
  scripts/migrate-docs.ts      # utility to re-copy docs/public into src/content/docs
```

## Commands

```bash
pnpm --filter @devicesdk/docs dev          # dev server
pnpm --filter @devicesdk/docs build        # static build to dist/
pnpm --filter @devicesdk/docs check-types  # astro check
pnpm --filter @devicesdk/docs lint         # nimbus-docs lint (mdx only today)
pnpm --filter @devicesdk/docs deploy       # wrangler deploy (requires CF credentials)
```

## Adding / editing docs

- Pages are Markdown files under `src/content/docs/`. The filesystem is the URL.
- `_index.md` from `docs/public` becomes `index.md` here.
- Required frontmatter: `title`. Recommended: `description`.
- Sidebar order is controlled by `sidebar.order`. Section index pages use `0`; weighted children keep their original `weight`.
- Internal links must not start with `/docs/`.
- MDX components must be PascalCase and registered in `src/components.ts`.

## Syncing from docs/public (phase 1 only)

If you need to re-copy from `docs/public` (e.g. after a batch update there), run:

```bash
pnpm exec tsx apps/docs/scripts/migrate-docs.ts
```

Then review the diff carefully; the migration is a one-way copy, not a merge.

## Don't

- Don't remove or bypass `AgentDirective` in `BaseLayout.astro`.
- Don't add unregistered MDX components.
- Don't import `.mdx` files directly - use `<Render file="..." />`.
- Don't change `docs/public` from this app.
- Don't switch the docs subdomain to route to the main website; that requires a separate follow-up.

## Project home

[Nimbus docs](https://nimbus-docs.com) · [DeviceSDK repo](https://github.com/device-sdk/devicesdk)

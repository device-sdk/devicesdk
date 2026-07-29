# apps/docs - Agent Guide

This app hosts the DeviceSDK documentation site at `https://docs.devicesdk.com` using [Nimbus](https://nimbus-docs.com) (Astro-based docs framework). It is a separate Cloudflare Workers static site from the main marketing website in `apps/website`.

## Important context

- **Source of truth.** `apps/docs/src/content/docs/` is now the source of truth
  for DeviceSDK documentation. The old `docs/public/` directory and the
  `apps/website` `/docs/` mount have been removed; `devicesdk.com/docs/*` redirects
  to `https://docs.devicesdk.com/*` preserving the path.
- **URLs drop the `/docs/` prefix.** On this subdomain, `/docs/quickstart/`
  becomes `/quickstart/`. Internal links in `src/content/docs/**/*.md` must use
  `/quickstart/` style paths.
- **Deploy is gated by version packages.** `.github/workflows/docs-deploy.yml`
  only auto-deploys when the release PR with commit subject `chore: version packages`
  merges, or on manual dispatch.

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
- Section index files are named `index.md` (e.g. `guides/index.md`).
- Required frontmatter: `title`. Recommended: `description`.
- Sidebar order is controlled by `sidebar.order`. Section index pages use `0`; weighted children keep their original `weight`.
- Internal links must not start with `/docs/`.
- MDX components must be PascalCase and registered in `src/components.ts`.

## Don't

- Don't remove or bypass `AgentDirective` in `BaseLayout.astro`.
- Don't add unregistered MDX components.
- Don't import `.mdx` files directly - use `<Render file="..." />`.
- Don't switch the docs subdomain to route to the main website; that requires a separate follow-up.

## Project home

[Nimbus docs](https://nimbus-docs.com) · [DeviceSDK repo](https://github.com/device-sdk/devicesdk)

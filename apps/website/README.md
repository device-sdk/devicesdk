# DeviceSDK Website

Marketing and documentation website for [DeviceSDK](https://devicesdk.com) - the free,
open-source, **self-hosted** IoT platform. This is the public site at `devicesdk.com`; it
is **not** part of the product (there is no hosted dashboard or managed cloud - users run
the DeviceSDK server on their own hardware).

## Tech stack

- **[Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/) + [vite-ssg](https://github.com/antfu/vite-ssg)** -
  static site generation. Each route renders to static HTML at build time. Page content lives
  in `content/` and the user docs are sourced from `../../docs/public` (mounted at `/docs/`
  by `scripts/build-content.ts`).
- **[Tailwind CSS v4](https://tailwindcss.com/)** - processed by `@tailwindcss/vite`.
- **[Playwright](https://playwright.dev/)** - renders social-preview (OG) images at build
  time (`generate-og.js`).
- **Cloudflare** - hosting and deployment via Wrangler. (Only the website is on
  Cloudflare; the DeviceSDK product itself is self-hosted and has no Cloudflare
  dependency.)

## Project structure

```
apps/website/
├── content/                # Page front-matter + markdown (privacy/terms use bodies)
├── docs/public (mounted)   # User docs source, copied/monitored at build time
├── scripts/
│   ├── build-content.ts    # Renders markdown, builds routes/sitemap/llms outputs
│   └── post-build.ts       # Normalizes dist/ route files (e.g. /docs.html → /docs/index.html)
├── src/
│   ├── main.ts             # vite-ssg entry + generated routes
│   ├── App.vue             # Global layout, animations, search, etc.
│   ├── pages/              # Route-level Vue components
│   ├── components/         # Shared partials (header, footer, search, etc.)
│   ├── composables/        # usePageContent, useSiteHead
│   ├── generated/          # Generated at build time (routes.ts, content.json, sitemap data)
│   └── styles/             # Global CSS and docs-specific overrides
├── static/                 # Static assets, _redirects, _headers, robots.txt
├── generate-og.js          # Playwright OG-image generation
├── generate-agent-skills.js
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Getting started

### Prerequisites

- Node.js and `pnpm` (run commands from the monorepo root, or `pnpm --filter @devicesdk/website ...`)
- `pnpm exec playwright install` once, so OG-image generation can run during `build`

### Development

```bash
pnpm --filter @devicesdk/website dev    # vite dev server with content rebuild
```

### Building

The full build depends on `apps/server/openapi.json` (copied into the docs API reference),
so build from the monorepo root:

```bash
pnpm build                              # Turbo builds the server first, then the website
```

Or directly (after the server's `openapi.json` exists):

```bash
pnpm --filter @devicesdk/website build  # content → OG images → vite-ssg → ./dist
```

## Deployment

The site is deployed to **Cloudflare Pages** via Wrangler:

```bash
pnpm --filter @devicesdk/website deploy   # npx wrangler pages deploy dist
```

## URL changes require a redirect

If you rename, move, or delete a page under `content/` or `docs/public/` (which lands at
`/docs/`), add a matching 301 to `static/_redirects` so the old URL keeps its search-index
signal. See `apps/website/AGENTS.md` for the full rule and format.

## License

AGPL-3.0-only. See the repository's [LICENSE](https://github.com/device-sdk/devicesdk/blob/main/LICENSE).

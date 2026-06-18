# DeviceSDK Website

Marketing and documentation website for [DeviceSDK](https://devicesdk.com) — the free,
open-source, **self-hosted** IoT platform. This is the public site at `devicesdk.com`; it
is **not** part of the product (there is no hosted dashboard or managed cloud — users run
the DeviceSDK server on their own hardware).

## Tech stack

- **[Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/)** — page
  components in `src/pages/`.
- **[vite-ssg](https://github.com/antfu/vite-ssg)** — static-site generation.
- **[vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages)** — file-based routing.
- **[Tailwind CSS v4](https://tailwindcss.com/)** — `src/styles/main.css`.
- **[D3](https://d3js.org/)** — interactive architecture diagrams.
- **[markdown-it](https://github.com/markdown-it/markdown-it) + [Shiki](https://shiki.style/)** —
  Markdown rendering and syntax highlighting for docs.
- **[Playwright](https://playwright.dev/)** — renders social-preview (OG) images at build
  time (`scripts/generate-og.ts`).
- **[Wrangler](https://developers.cloudflare.com/workers/wrangler/)** — deploys the static
  `dist/` output to Cloudflare Pages. (Only the website is on Cloudflare; the DeviceSDK
  product itself is self-hosted and has no Cloudflare dependency.)

## Project structure

```
apps/website/
├── index.html              # Vite HTML entry
├── vite.config.ts          # Vite + vite-ssg + pages plugin
├── src/
│   ├── pages/              # Marketing + architecture Vue pages
│   ├── components/         # Design system, layouts, diagrams
│   ├── styles/main.css     # Tailwind entry + utilities
│   ├── utils/              # Docs index, markdown renderer, routes
│   └── generated/          # Generated docs paths/index (gitignored)
├── content/                # Front-matter source for OG image titles
├── static/                 # Static assets, _redirects, _headers, .well-known
├── scripts/                # Prebuild, OG images, agent-skills manifest
├── public/                 # Generated build-time public dir (gitignored)
└── dist/                   # Final static output (gitignored)
```

## Getting started

### Prerequisites

- Node.js and `pnpm` (run commands from the monorepo root, or `pnpm --filter @devicesdk/website ...`)
- `pnpm exec playwright install` once, so OG-image generation can run during `build`

### Development

```bash
pnpm --filter @devicesdk/website dev    # vite dev server with prebuild
```

### Building

The full build depends on `apps/server/openapi.json` (copied into the docs API reference),
so build from the monorepo root:

```bash
pnpm build                              # Turbo builds the server first, then the website
```

Or directly (after the server's `openapi.json` exists):

```bash
pnpm --filter @devicesdk/website build  # prebuild → vite-ssg build → ./dist
```

## Deployment

The site is deployed to **Cloudflare Pages** via Wrangler:

```bash
pnpm --filter @devicesdk/website deploy   # wrangler pages deploy dist
```

## URL changes require a redirect

If you rename, move, or delete a page under `src/pages/` or `docs/public/` (which renders at
`/docs/`), add a matching 301 to `static/_redirects` so the old URL keeps its search-index
signal. See `apps/website/AGENTS.md` for the full rule and format.

## License

AGPL-3.0-only. See the repository's [LICENSE](https://github.com/device-sdk/devicesdk-monorepo/blob/main/LICENSE).

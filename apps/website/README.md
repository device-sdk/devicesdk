# DeviceSDK Website

Marketing and documentation website for [DeviceSDK](https://devicesdk.com) — the free,
open-source, **self-hosted** IoT platform. This is the public site at `devicesdk.com`; it
is **not** part of the product (there is no hosted dashboard or managed cloud — users run
the DeviceSDK server on their own hardware).

## Tech stack

- **[Hugo](https://gohugo.io/)** — static site generator. Page content lives in `content/`
  (front-matter, mostly) and the user docs are mounted from `../../docs/public` (see
  `[[module.mounts]]` in `hugo.toml`); the visual layouts are hand-written HTML in
  `layouts/`.
- **[Tailwind CSS v4](https://tailwindcss.com/)** — compiled from `src/input.css` to
  `static/styles.css` via `@tailwindcss/cli`.
- **[Playwright](https://playwright.dev/)** — renders social-preview (OG) images at build
  time (`generate-og.js`).
- **Cloudflare** — hosting and deployment via Wrangler. (Only the website is on
  Cloudflare; the DeviceSDK product itself is self-hosted and has no Cloudflare
  dependency.)

## Project structure

```
apps/website/
├── hugo.toml               # Hugo config (mounts ../../docs/public at /docs)
├── content/                # Page front-matter + markdown (privacy/terms use bodies)
├── layouts/                # Hand-written HTML/Tailwind layouts per section
├── src/input.css           # Tailwind entry (compiled to static/styles.css)
├── static/                 # Static assets, _redirects, _headers, robots.txt
├── generate-og.js          # Playwright OG-image generation
├── generate-agent-skills.js
└── package.json
```

## Getting started

### Prerequisites

- Node.js and `pnpm` (run commands from the monorepo root, or `pnpm --filter @devicesdk/website ...`)
- [Hugo](https://gohugo.io/installation/) (extended)
- `pnpm exec playwright install` once, so OG-image generation can run during `build`

### Development

```bash
pnpm --filter @devicesdk/website dev    # hugo server -D, live reload
```

### Building

The full build depends on `apps/server/openapi.json` (copied into the docs API reference),
so build from the monorepo root:

```bash
pnpm build                              # Turbo builds the server first, then the website
```

Or directly (after the server's `openapi.json` exists):

```bash
pnpm --filter @devicesdk/website build  # tailwind → OG images → hugo, into ./public
```

## Deployment

The site is deployed to **Cloudflare** via Wrangler:

```bash
pnpm --filter @devicesdk/website deploy   # npx wrangler deploy
```

## URL changes require a redirect

If you rename, move, or delete a page under `content/` or `docs/public/` (which mounts at
`/docs/`), add a matching 301 to `static/_redirects` so the old URL keeps its search-index
signal. See `apps/website/CLAUDE.md` for the full rule and format.

## License

AGPL-3.0-only. See the repository's [LICENSE](https://github.com/device-sdk/devicesdk-monorepo/blob/main/LICENSE).

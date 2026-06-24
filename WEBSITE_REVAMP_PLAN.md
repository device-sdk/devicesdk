# DeviceSDK Marketing Website Revamp Plan

## Summary

Migrate the DeviceSDK marketing website (`apps/website`) from Hugo to a **Vue 3 + TypeScript + vite-ssg** static site. The new site will be precompiled to static HTML/CSS/JS in CI and deployed to Cloudflare Pages via Wrangler. The redesign adopts a distinctive **"hardware blueprint / terminal"** aesthetic that avoids generic SaaS styling, and adds five new architecture explainer pages with D3 charts and GSAP animations.

The existing documentation remains authored in Markdown under `docs/public/` and is rendered into a clean, high-contrast **light UI** at build time.

---

## Goals

- Replace Hugo with Vue 3 + vite-ssg (SPA behavior disabled at runtime).
- Use TypeScript in Vue SFCs and utilities.
- Use Tailwind CSS 4 for styling.
- Use D3 for data-driven charts and diagrams.
- Use GSAP (ScrollTrigger) for scroll-driven animations.
- Preserve all existing URLs, redirects, OG images, SEO metadata, and static assets.
- Add new architecture pages that explain how DeviceSDK works end-to-end.
- Deploy precompiled artifacts from CI via Wrangler.

---

## Decisions

| Decision | Choice |
|----------|--------|
| Framework | Vue 3 + vite-ssg |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts | D3 |
| Animations | GSAP + ScrollTrigger |
| Docs source | Markdown in `docs/public/`, rendered at build time |
| Docs UI theme | Clean, high-contrast light interface (Option B) |
| Marketing theme | Dark "terminal / hardware blueprint" aesthetic |
| Hosting / deployment | Cloudflare Pages via `wrangler deploy` |
| New pages | 5 architecture deep-dives under `/architecture/` |

---

## Visual Direction

The marketing site moves away from soft gradient orbs and floating SaaS cards toward a **precision-engineered, terminal/PCB aesthetic**:

- **Base palette:** near-black slate/zinc background.
- **Primary accent:** amber (`#f59e0b`) - evoking a terminal cursor or status LED.
- **Status accent:** emerald reserved for "live / success" indicators only.
- **Typography:** Inter for body UI, JetBrains Mono for headings, labels, and pin numbers.
- **Signature details:**
  - PCB-trace lines and 45° corner treatments on cards.
  - Schematic-style bracket corners on feature boxes.
  - Pinout-style labels (`GPIO 14`, `WS`, `3.3V`) used as decorative accents.
  - Subtle grid/ruler backgrounds in hero sections.
  - Blinking terminal cursor in hero copy.
  - Monospace section numbers (`01`, `02`, …).
- **Mood:** "Tool for engineers," not "enterprise dashboard."

The docs UI remains a clean, readable light theme (similar to the current docs) but uses the same typography scale and spacing system for cohesion.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Build tool | Vite |
| Static generation | vite-ssg |
| Framework | Vue 3 Composition API |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Charts / diagrams | D3 |
| Animations | GSAP + ScrollTrigger |
| Markdown | markdown-it + Shiki |
| OG images | Playwright |
| Deployment | Wrangler / Cloudflare Pages |

---

## Project Structure

```
apps/website/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.vue
│   │   │   ├── AppFooter.vue
│   │   │   ├── MarketingLayout.vue      # dark blueprint shell
│   │   │   └── DocsLayout.vue           # clean light shell
│   │   ├── ui/
│   │   │   ├── CodeWindow.vue
│   │   │   ├── TerminalBlock.vue
│   │   │   ├── SchematicCard.vue
│   │   │   ├── PinLabel.vue
│   │   │   ├── Badge.vue
│   │   │   └── Button.vue
│   │   ├── animations/
│   │   │   ├── ScrollReveal.vue
│   │   │   ├── StaggerReveal.vue
│   │   │   └── HeroEnter.vue
│   │   └── diagrams/
│   │       ├── ArchitectureTopology.vue
│   │       ├── DataFlowDiagram.vue
│   │       ├── MessageSequence.vue
│   │       ├── DeploymentTimeline.vue
│   │       └── ComparisonChart.vue
│   ├── composables/
│   │   ├── useScrollProgress.ts
│   │   ├── useReducedMotion.ts
│   │   └── useInView.ts
│   ├── pages/
│   │   ├── index.vue
│   │   ├── product.vue
│   │   ├── solutions.vue
│   │   ├── examples.vue
│   │   ├── community.vue
│   │   ├── about.vue
│   │   ├── terms.vue
│   │   ├── privacy.vue
│   │   ├── architecture/
│   │   │   ├── index.vue
│   │   │   ├── data-flow.vue
│   │   │   ├── runtime.vue
│   │   │   ├── self-hosting.vue
│   │   │   └── comparison.vue
│   │   └── docs/
│   │       ├── index.vue
│   │       └── [...slug].vue
│   ├── styles/
│   │   ├── main.css
│   │   ├── animations.css
│   │   └── syntax.css
│   ├── utils/
│   │   ├── docs.ts          # walk docs/public, build route tree
│   │   ├── markdown.ts      # markdown-it + Shiki setup
│   │   ├── routes.ts
│   │   └── meta.ts          # SEO / structured data helpers
│   ├── App.vue
│   └── main.ts
├── content/                 # marketing copy / data (JSON/YAML)
├── docs/                    # mounted from ../../docs/public at build
├── public/                  # logo, _redirects, _headers, .well-known, robots.txt
├── scripts/
│   ├── generate-og.ts       # Playwright OG image generation
│   ├── generate-agent-skills.ts
│   └── build-docs-routes.ts
├── vite.config.ts
├── vite.config.ssg.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── wrangler.toml
```

---

## Pages

### Existing marketing pages (migrate + redesign)

- `/` - Home
- `/product/`
- `/solutions/`
- `/examples/`
- `/community/`
- `/about/`
- `/terms/`
- `/privacy/`
- `/404`

### New architecture pages

1. **`/architecture/`**  
   End-to-end platform overview with an interactive SVG/D3 topology diagram. Users can hover or click layers (device firmware, WebSocket, server runtime, dashboard) to reveal responsibilities.

2. **`/architecture/data-flow/`**  
   Animated D3 diagram showing a command/response packet traversing:  
   `device → WebSocket → session → script → WebSocket → device`.

3. **`/architecture/runtime/`**  
   Device session lifecycle, FIFO dispatch, cron scheduling, KV storage, and inter-device RPC.

4. **`/architecture/self-hosting/`**  
   Docker topology, `DATA_DIR`, SQLite/WAL, security model, TLS/reverse-proxy decision tree.

5. **`/architecture/comparison/`**  
   D3 radar or grouped-bar chart comparing DeviceSDK to cloud IoT platforms on: self-hosted, TypeScript, simulator, pricing model, vendor lock-in, offline/LAN capability.

### Docs pages

- `/docs/` - docs landing
- `/docs/:slug*` - all pages from `docs/public/**/*.md`

---

## Animation Plan (GSAP)

| Element | Implementation |
|---------|----------------|
| Scroll reveals | `ScrollTrigger.batch` for sections/cards; disabled when `prefers-reduced-motion` |
| Homepage assembly scene | `ScrollTrigger` scrub + pin; pieces translate/rotate into place; SVG paths draw connection lines |
| Packet flow | GSAP `MotionPathPlugin` along SVG paths |
| Terminal code reveals | Staggered text reveal with blinking cursor |
| Counters | `gsap.to` on numeric values |
| Hover states | CSS transitions only, no JS, for performance |
| Reduced motion | Snap to final state; disable scrub animations |

---

## Chart / Diagram Plan (D3)

- **Architecture topology:** fixed or force-directed node-link diagram; hover highlights connections.
- **Message sequence:** time-axis diagram with enter/exit transitions.
- **Comparison chart:** responsive horizontal bar chart or radar chart.
- **Deployment timeline:** step connector with active-state transitions.
- **Hardware matrix:** simple heatmap/table hybrid.

---

## Docs Renderer

1. Build step walks `docs/public/**/*.md`.
2. Frontmatter (`title`, `description`, `social_image`) becomes route meta.
3. `markdown-it` renders body; Shiki highlights code fences.
4. Generate table of contents from headings.
5. Sidebar navigation built from directory structure.
6. Output paths mirror current `/docs/**` URLs.
7. Rendered inside a clean, light `DocsLayout` with sticky sidebar and TOC.

---

## Pre-Build Artifacts

Preserve and port the following from the current Hugo setup:

- Copy `apps/server/openapi.json` → `public/docs/api/openapi.json`
- `scripts/generate-og.ts` - generate OG images for all pages + docs via Playwright
- `scripts/generate-agent-skills.ts` - build `/.well-known/agent-skills/index.json`
- `scripts/build-docs-routes.ts` - generate docs route manifest for vite-ssg
- `sitemap.xml`
- `robots.txt`
- `llms.txt` / `llms-full.txt`
- `static/_redirects`
- `static/_headers`
- `static/.well-known/*`

---

## SEO / Structured Data

Preserve:

- Canonical URLs
- OpenGraph images and metadata
- Twitter cards
- JSON-LD (`Organization`, `WebSite`, `TechArticle`, `BreadcrumbList`)
- Sitemap

---

## CI/CD Plan

1. Update `apps/website/package.json`:
   - `dev`: `vite dev`
   - `build`: `tsx scripts/prebuild.ts && vite-ssg build`
   - `deploy`: `wrangler deploy`
2. Add website to the monorepo build graph (`turbo.json`).
3. Add a deploy job to `.github/workflows/release.yml` or create `website-deploy.yml`.
4. Cache Playwright browsers and `.turbo`.

---

## Implementation Phases

### Phase 1 - Scaffold
- Replace Hugo with Vite + Vue 3 + vite-ssg + TypeScript.
- Configure Tailwind CSS 4.
- Install D3, GSAP, markdown-it, Shiki, Playwright.
- Preserve static assets (`public/`).

### Phase 2 - Design System
- Define Tailwind theme tokens (colors, typography, spacing).
- Build layout shells (`MarketingLayout`, `DocsLayout`).
- Build base UI components (`CodeWindow`, `TerminalBlock`, `SchematicCard`, `PinLabel`, `Badge`, `Button`).
- Build animation wrappers (`ScrollReveal`, `StaggerReveal`, `HeroEnter`).

### Phase 3 - Marketing Pages
- Migrate Home, Product, Solutions, Examples, Community, About, Terms, Privacy.
- Apply new blueprint theme.
- Reimplement homepage scroll-assembly scene with GSAP ScrollTrigger.
- Add micro-animations and terminal-style details.

### Phase 4 - Architecture Pages
- Build the five architecture pages.
- Implement D3 diagrams.
- Add GSAP scroll scenes and packet-flow animations.

### Phase 5 - Docs Renderer
- Implement markdown pipeline.
- Build docs sidebar and TOC.
- Apply clean light theme inside `DocsLayout`.

### Phase 6 - Pre-Build Scripts
- Port OG image generation to TypeScript.
- Port agent-skills manifest generator.
- Generate sitemap and docs route manifest.
- Verify `_redirects`, `_headers`, `.well-known` files.

### Phase 7 - CI/CD
- Update package scripts.
- Integrate into GitHub Actions.
- Configure Wrangler deployment.

### Phase 8 - QA
- URL/redirect audit.
- Lighthouse performance/accessibility audit.
- Mobile testing.
- Reduced-motion testing.
- SEO metadata verification.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| D3/GSAP inflate bundle | Code-split per page; import only needed plugins. |
| Playwright slows CI | Cache browsers; skip OG images that already exist. |
| Docs URL changes | Keep current slug mapping; add redirects for any renames. |
| SEO regression | Preserve canonicals, OG, JSON-LD, sitemap. |
| Accessibility | All GSAP scenes honor `prefers-reduced-motion`. |
| Maintenance overhead | Document animation and diagram components; keep files under 700 LOC. |

---

## Next Steps

1. Create a dedicated git worktree and feature branch per the repo Git workflow.
2. Add a changeset for `@devicesdk/website`.
3. Begin Phase 1 (scaffold) by replacing the Hugo setup with the new Vite + vite-ssg project.

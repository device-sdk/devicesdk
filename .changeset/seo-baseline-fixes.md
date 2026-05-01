---
"@devicesdk/website": patch
---

SEO baseline fixes for devicesdk.com, driven by a Search Console audit showing only 13/21 known URLs indexed and a brand-only impression profile (95 imp/qtr on "device sdk" with 2.1% CTR at avg position 7.4):

- **head.html**: emit `<link rel="canonical">` on every page, branch `og:type` between `website` (home + section landings) and `article` (docs + legal). Add `og:site_name`, `og:locale`, and `twitter:site` for SERP/social attribution. Combine Organization + WebSite JSON-LD under `@graph` on the home page; add BreadcrumbList JSON-LD on `/docs/*` pages with depth ≥ 2; add TechArticle JSON-LD on `/docs/*` single pages with `datePublished`/`dateModified` pulled from git so docs qualify for the visual Article rich snippet.
- **hugo.toml**: enable `enableGitInfo` and add a `[sitemap]` block so the generated sitemap carries `<lastmod>` derived from git commit dates (45 lastmod entries vs. 0 before). Add `[frontmatter]` resolution chain so `.Date` and `.Lastmod` fall back to `:git` when no front-matter dates are set. Retitle the home and replace the site-wide description so the SERP snippet leads with the verb and the hardware names searchers care about ("Deploy TypeScript to ESP32 & Raspberry Pi Pico").
- **`static/_redirects`** (new): 301 the stale `/docs/resources/hardware/*` URLs to `/docs/hardware/*` (Google was wasting ~36 imp/qtr on the old path), the deleted `/docs/guides/control-from-browser/`, and `/docs` → `/docs/`.
- **CLAUDE.md + new `.claude/skills/website-url-changes/SKILL.md`**: codify a "URL change → 301 redirect" rule so future content moves don't re-create the same SEO debt. The skill auto-triggers on any rename/move/delete under `apps/website/content/` or `docs/public/`, or any `permalink`/`url`/`[permalinks]`/`[[module.mounts]]` edit that shifts URLs.

Sitemap re-submission in Search Console (HTTP → HTTPS), validation of "Duplicate without canonical" and "Not found (404)" rows, and a "Request indexing" of the home page are manual GSC follow-ups not covered here.

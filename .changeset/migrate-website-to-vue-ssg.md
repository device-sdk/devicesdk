---
"@devicesdk/website": patch
---

Migrate the marketing website from Hugo to a Vue.js + Vite SSG stack.

The site is now built with `vite-ssg`, renders every route to static HTML in
`dist/`, and is deployed to Cloudflare Pages via `wrangler pages deploy`. All
existing pages, URLs, Tailwind styling, SEO/meta tags, sitemap, `llms.txt`,
`llms-full.txt`, per-page `index.md` mirrors, OG images, and `.well-known`
outputs are preserved. Docs continue to be sourced from `../../docs/public/`.

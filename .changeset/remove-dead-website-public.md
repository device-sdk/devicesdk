---
"@devicesdk/website": patch
---

Remove the stale `apps/website/public/` directory. It was a committed snapshot
of an old site build (cloud-era copy, e.g. `dash.devicesdk.com`) and is not part
of the build: Vite's `publicDir` is `static`, and Cloudflare serves `dist`, so
nothing under `public/` was ever deployed. Every infra file it duplicated
(`_redirects`, `_headers`, `robots.txt`, `.well-known/`, etc.) already lives in
`static/`.

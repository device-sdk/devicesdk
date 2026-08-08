---
"@devicesdk/website": patch
---

Remove the dead `/docs/api/*` redirect rules: the API HTML page no longer
exists on the main site and there is no docs API reference page, so the 301s
landed on 404s. `/docs/api/*` now falls through to the `/docs/*` redirect to
the docs subdomain.

---
"@devicesdk/website": patch
---

Add trailing slash to `https://devicesdk.com/docs/api/` references in `static/.well-known/api-catalog` and `static/.well-known/oauth-protected-resource`. The site canonicalizes docs URLs with a trailing slash, so the previous values caused a 307 redirect hop for clients (and crawlers) that fetched these machine-readable metadata files.

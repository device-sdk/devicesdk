---
"@devicesdk/server": patch
---

Fix Docker image build failing at the docs-index step: the path passed to
`build-docs-index.ts` was resolved relative to `apps/server` instead of the
repo root, so the docs directory was never found.

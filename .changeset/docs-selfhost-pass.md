---
"@devicesdk/website": patch
---

Docs & website content pass for the self-hosted, open-source pivot. The
marketing site, README, and the public docs (`docs/public/`) described the old
Cloudflare-hosted, managed-runtime SaaS — they now describe running the
DeviceSDK server yourself.

- **Marketing site**: homepage, product, solutions, about, community, and 404
  repositioned to "free, open-source (AGPL-3.0), self-hosted." Pricing and
  Early-Access (private beta) pages removed, with 301 redirects added. Nav,
  menus, CTAs, footer, and the primary call-to-action now point at GitHub and
  the quickstart instead of a hosted dashboard sign-up. Terms and Privacy
  rewritten for self-hosted software (AGPL-3.0; no service collecting your
  data; no telemetry).
- **Docs (`docs/public/`)**: architecture, concepts, CLI, quickstart, guides,
  recipes, resources, and errors rewritten — in-process device runtime on your
  own server (not a "globally distributed serverless runtime"), `devicesdk
  login --host`, `~/.devicesdk/credentials.json`, devices on `ws://<server>:8080`,
  and honest rate-limit/scaling sections. Obsolete `account_suspended` and
  `account_deletion_pending` error pages removed (redirected). Self-host
  changelog entry added.
- **README** rewritten around `docker compose up -d` and the self-hosted
  workflow; project-structure table updated (`apps/server` replaces `apps/api`).
- Agent-discovery files (`llms.txt`, `llms-full.txt`, `.well-known/agent-skills`,
  `api-catalog`, `oauth-protected-resource`) updated to describe the in-process,
  self-hosted runtime.

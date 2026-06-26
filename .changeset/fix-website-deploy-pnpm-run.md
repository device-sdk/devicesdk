---
"@devicesdk/website": patch
---

Fix website deploy CI: use `pnpm run deploy` so pnpm invokes the package script instead of its own built-in deploy subcommand.

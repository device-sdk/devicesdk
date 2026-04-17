---
"@devicesdk/api": patch
"@devicesdk/cli": patch
"@devicesdk/core": patch
---

- Fix `devicesdk init` template: declare `@devicesdk/core` as a runtime dep of the CLI so resolved versions reflect the installed package (was hardcoded `^0.0.1`); install with the package manager that invoked the CLI (pnpm, yarn, npm, or bun) via `npm_config_user_agent` detection.
- Expose `./package.json` in `@devicesdk/core` package exports so version lookups via `createRequire` / `require.resolve` work under Node's `exports`-enforced resolution.
- Return a 500 JSON error when UF2 firmware validation fails after patching, instead of a 200 response with an `X-Firmware-Validation: failed` header that most clients would ignore.
- Add a safety comment in the device Durable Object explaining the in-memory `logWatchers` cleanup behavior across hibernation.

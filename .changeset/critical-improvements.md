---
"@devicesdk/api": patch
"@devicesdk/cli": patch
---

- Fix `devicesdk init` template: resolve `@devicesdk/core` and `@devicesdk/cli` versions dynamically and install with the package manager that invoked the CLI (detected via `npm_config_user_agent`), instead of hardcoding `^0.0.1` and `npm install`.
- Return a 500 JSON error when UF2 firmware validation fails after patching, instead of a 200 response with an `X-Firmware-Validation: failed` header that most clients would ignore.
- Add a safety comment in the device Durable Object explaining the in-memory `logWatchers` cleanup behavior across hibernation.

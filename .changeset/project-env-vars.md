---
"@devicesdk/api": minor
"@devicesdk/cli": minor
"@devicesdk/core": minor
---

Add project-scoped environment variables for device scripts.

Device scripts can now access secrets via `this.env.VARS.get("KEY")` without hardcoding them in source code. Variables are managed per-project with CLI commands (`devicesdk env set KEY=VALUE`, `env list`, `env unset KEY`) and stored securely outside of device scripts.

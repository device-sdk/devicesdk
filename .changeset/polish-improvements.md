---
"@devicesdk/cli": patch
---

- Add usage examples (`.addHelpText("after", ...)`) to every `devicesdk` subcommand — `login`, `logout`, `whoami`, `init`, `dev`, `build`, `deploy`, `logs`, `flash`, `status`, `inspect`, `env set`/`list`/`unset`. Discoverable via `--help`.
- Import `HaEntityDeclaration` type from `@devicesdk/core` in `config.ts` instead of redeclaring it. The local Zod schema stays in the CLI (core has no runtime deps), but its inferred shape is now type-asserted against the core interface to catch drift.
- Remove `"dependsOn": ["^build"]` from the `lint` Turbo task — linting does not need built upstream artifacts, so this lets `pnpm lint` run in parallel with (and independently of) `pnpm build`.

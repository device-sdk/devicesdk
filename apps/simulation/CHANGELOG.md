# @devicesdk/simulation

## 0.1.8

### Patch Changes

- Updated dependencies [d03b5ae]
  - @devicesdk/core@1.4.0

## 0.1.7

### Patch Changes

- 394d469: UX fixes batched from a new-user trial — eight small papercuts, one PR:
  - **@devicesdk/cli**: `loadConfig` / `getConfigDir` now walk up parent directories to find `devicesdk.ts`, so `deploy`, `dev`, `flash`, `logs`, `status`, `inspect`, and `env` work from any subdirectory of a project. `--config` and `DEVICESDK_CONFIG` still short-circuit the walk.
  - **@devicesdk/cli**: `devicesdk logs` accepts optional positionals — both default from `devicesdk.ts`. With one positional it's treated as the device slug (project comes from config); with two, it's `[project] [device]` as before. Multi-device projects without a positional get a friendly "pass one as positional" error listing the available device slugs.
  - **@devicesdk/cli**: 4xx response bodies are no longer dumped to stderr on every API error. Auth-revoked sessions now print one line — `Session expired — run \`devicesdk login\`.`— instead of`Response body (401): { ... }`followed by paragraph-long advice. Run with`--verbose`to keep the raw dump for debugging. The`downloadDeviceFirmware`path picks up the same treatment, so`flash` is quieter on auth/server errors.
  - **@devicesdk/cli**: `flash` permission-denied error mentions the Arch Linux `uucp` group (not just Debian's `dialout`) and links to the docs page that ships a persistent `99-devicesdk-serial.rules` snippet.
  - **@devicesdk/api**: the device runtime no longer prepends `[<projectId>:<deviceId>]` to every `console.log/info/warn/error/debug` call. Persisted log entries were already prefix-free; this drops the redundant tag from Wrangler tail / runtime stdout. Devices already carry their identity via the watcher URL.
  - **@devicesdk/simulation**: when the local dev server restarts after a file edit, the simulator UI now auto-reconnects with exponential backoff (1 s → 30 s) and shows a "Local server restarted — reconnecting…" banner instead of silently going dead until the user refreshes the browser.
  - **@devicesdk/website**: new `concepts/identifiers` page explains project slug vs device slug vs the underlying UUIDs in one place. The CLI reference index now points at it. The `flash` page documents serial-port permissions for both Debian-style (`dialout`) and Arch (`uucp`) systems, ships a copy-pasteable `99-devicesdk-serial.rules` udev snippet for CP210x / CH340 / FTDI bridges, and adds a "Verify connectivity" subsection pointing at `devicesdk status` after the LED sequence. The pin-read example on the first-device page is now a complete copy-pasteable snippet showing how to discriminate digital vs analog reads.

- Updated dependencies [71aedb1]
  - @devicesdk/core@1.3.0

## 0.1.6

### Patch Changes

- Updated dependencies [fd6e829]
  - @devicesdk/core@1.2.1

## 0.1.5

### Patch Changes

- Updated dependencies [e53d79f]
  - @devicesdk/core@1.2.0

## 0.1.4

### Patch Changes

- Updated dependencies [23b8924]
  - @devicesdk/core@1.1.2

## 0.1.3

### Patch Changes

- Updated dependencies [618636f]
- Updated dependencies [6ba99ed]
  - @devicesdk/core@1.1.1

## 0.1.2

### Patch Changes

- Updated dependencies [c9a38e3]
- Updated dependencies [9ab6698]
- Updated dependencies [00991a8]
- Updated dependencies [1c28cba]
  - @devicesdk/core@1.1.0

## 0.1.1

### Patch Changes

- Updated dependencies [bc3493a]
- Updated dependencies [bdd52f7]
  - @devicesdk/core@1.0.0

# Plan 007: Add MQTT as an optional device transport via a lazy-loaded plugin

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src packages/core/src packages/cli/src firmware/esp32 firmware/pico Dockerfile docker-compose.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (owner-requested feature)
- **Effort**: L
- **Risk**: MED (new wire protocol + firmware changes; mitigated by verified spikes, see below)
- **Depends on**: none (independent of plans 001-006)
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-05

## Owner decisions already made (do not re-litigate)

These were decided by the project owner on 2026-07-05 when this plan was
generated:

1. **Broker**: embedded in the server process, implemented with the **aedes**
   npm package (not an in-house broker, not an external user-provided broker).
2. **Optionality**: aedes must NOT be a static import of the core server.
   The MQTT transport is a separate workspace package
   `@devicesdk/transport-mqtt`, listed as a server dependency but only
   **dynamically imported when `MQTT_ENABLED=1`**. Default is OFF.
3. **Plugin surface**: the server also scans `PLUGINS_DIR`
   (default `<DATA_DIR>/plugins/`) for `*.js` transport plugin files, so
   third-party transports can be dropped in without rebuilding the image.
4. **Scope**: full stack in one phased plan - server contract + plugin,
   CLI config option, firmware patching, ESP32 client, Pico client, docs.
5. **Default transport stays `websocket`**; MQTT is opt-in per device.

## Facts verified by spike (2026-07-05, do not re-derive)

A spike was run on this machine with Bun 1.3.14 (the server runtime version
pinned in the Dockerfile):

- `aedes@1.1.1` works on Bun with `node:net`. The API is:
  `import { Aedes } from "aedes"; const broker = await Aedes.createBroker({ authenticate });`
  (the default export was removed in aedes 1.x and throws a migration error;
  `new Aedes()` is NOT the public API - use the static `Aedes.createBroker`).
- The `authenticate(client, username, password, done)` hook works; rejecting
  with `done(null, false)` surfaces "Connection refused: Not authorized" to
  the client. `password` arrives as a Buffer - call `.toString()`.
- Publish works in both directions (`broker.publish(...)` server-to-device,
  `broker.on("publish", (packet, client) => ...)` device-to-server; the
  `client` argument is null for broker-originated publishes - filter on it).
- Same-clientId takeover works: connecting a second client with the same
  clientId disconnects the first (events observed in order:
  `ready`, `disconnect` (old), `ready` (new)). This natively mirrors the
  server's single-live-socket rule (`WS_CLOSE_REPLACED`).
- `bun build --target=bun --outfile server.js` (the exact command the
  Dockerfile uses) bundles a dynamically-imported module that imports aedes
  into the single output file (~380 KB added) and **preserves lazy
  evaluation**: the plugin module's top-level code does not run unless the
  `import()` expression is actually reached. So `MQTT_ENABLED` gating works
  in the bundled Docker build with zero Dockerfile changes to the build steps.
- `mqtt@5.15.1` (client) works on Bun - use it as the devDependency for tests.

## Why this matters

DeviceSDK devices currently have exactly one way to reach the server: a
WebSocket per device. MQTT is the lingua franca of the hobbyist/IoT world -
supporting it lets devices with existing MQTT firmware stacks, constrained
clients, and users who prefer pub/sub semantics join a DeviceSDK server
without giving up any of the runtime contract (commands, acks, crons, logs,
usage metrics). The server runtime is already transport-agnostic at its core
(`DeviceSession` drives an abstract `{send, close}` socket), so the cost is
concentrated in one new ingress (an embedded MQTT broker) plus firmware
clients. Shipping it as a lazy-loaded plugin keeps the core server free of
broker code and establishes a transport-plugin surface for future protocols.

## Current state

All references are at commit `bbd724d`.

### Server runtime (the "generic pipe" already exists)

- `apps/server/src/runtime/deviceSession.ts` - per-device state machine. Its
  device-facing surface is transport-agnostic already:
  - `handleDeviceOpen(ws: RuntimeSocket, meta: DeviceMeta)` (line 126)
  - `handleDeviceMessage(ws: RuntimeSocket, data: string | ArrayBuffer)` (line 172)
  - `handleDeviceClose(ws, code, reason)` (line 242), `handleDeviceError` (line 249)
  - Frames are JSON strings validated by `DeviceMessageSchema` (line 31):
    `{ id?: string, type: string, payload?: object }`. `type === "ping"` is
    a keepalive, never dispatched (line 197). `type === "device_connected"`
    triggers `onDeviceConnect` + cron initialization (line 203).
  - Stale-socket guards compare object identity (`ws !== this.deviceWs`), so
    each live connection must be represented by ONE stable object.
- `apps/server/src/runtime/types.ts` line 46:
  ```ts
  export interface RuntimeSocket {
      send(data: string): void;
      close(code?: number, reason?: string): void;
  }
  ```
- `apps/server/src/runtime/deviceHub.ts` - `hub.get(projectId, deviceId)`
  returns the lazily-created `DeviceSession` (UUID keys).
- `apps/server/src/endpoints/devices/wsRoutes.ts` - the ONLY transport today.
  Auth/lookup happens in a pre-upgrade handler: `resolveProjectAndDevice`,
  then `versionId = device.current_version_id` when `"latest"`, then a
  `device_scripts` row lookup for the entrypoint, building a `DeviceMeta`:
  ```ts
  meta: {
      userId: user.id,
      projectId: project.id,
      deviceId: device.id,
      projectSlug: projectId,   // slugs locate the script blob
      deviceSlug: deviceId,
      versionId,
      entrypointName: version.entrypoint,
  }
  ```
  `makeStableSocket()` (line 30) exists because hono hands a fresh WSContext
  per event; MQTT connections don't have that problem but the one-stable-
  object-per-connection rule still applies.
- `apps/server/src/server.ts` - boot order: loadConfig, DB + migrations,
  FsBlobStores, `DeviceHub`, services `Env` object, `installConsoleCapture()`,
  `startJanitor`, `Bun.serve`, `services.server = server`, mDNS responder,
  SIGINT/SIGTERM shutdown hooks. New transports start after `Bun.serve` and
  stop in `shutdown()` alongside `mdns?.stop()`.
- `apps/server/src/config.ts` - `ServerConfig` + `loadConfig(env)`; booleans
  via `parseBool(value, fallback)`. Model new fields on `mdnsEnabled` /
  `mdnsHostname` (lines 83-84).
- `apps/server/src/types.d.ts` - `Env` services interface (SCRIPTS,
  FIRMWARES, DEVICE, qb, DB, ENV, config, server).

### Auth (what an MQTT CONNECT must replicate)

- `apps/server/src/foundation/auth.ts` - the API-token branch (lines ~223-256)
  is what device firmware tokens hit:
  ```ts
  const apiTokenHash = await hashToken(token, secret);   // secret = c.env.config.apiTokenSecret
  const tokenUser = await c.get("qb").fetchOne<tableUser>({
      tableName: "tokens t",
      fields: "u.*",
      join: { table: "user u", on: "t.user_id = u.id" },
      where: { conditions: ["t.token_hash = ?1"], params: [apiTokenHash] },
  }).execute();
  ```
  `hashToken` comes from `apps/server/src/foundation/tokenHash.ts`.
- `apps/server/src/foundation/projectDeviceResolve.ts` - project by
  `(user_id, project_slug)`, device by `(project_id, device_slug)`. It is
  Hono-context-coupled (returns `Response` on miss), so the transport host
  reimplements the two `qb.fetchOne` queries directly rather than calling it.

### CLI config (where the user picks the transport)

- The project config file is **`devicesdk.ts`** (NOT `devicesdk.config.ts` -
  `packages/cli/src/commands/init.ts:336` explicitly warns the loader only
  reads `devicesdk.ts`).
- `packages/cli/src/config.ts` - `DeviceConfigSchema` (per-device Zod object:
  className, main, deviceType, wifi, optional ha) and `DeviceSDKConfigSchema`
  (projectId + `devices` record). `defineConfig()` is the user-facing helper.
- `packages/cli/src/commands/flash.ts` - calls `downloadDeviceFirmware(...)`
  (lines 136 and 175) passing wifi + deviceType + `{ host: options.host }`.
- `packages/cli/src/api/devices.ts:110` - `downloadDeviceFirmware(token,
  projectId, deviceId, wifi, deviceType, options?: { host?: string })` POSTs
  `{ ssid, pass, device_type, host? }` to
  `/v1/projects/{p}/devices/{d}/firmware`.

### Firmware credential patching (how the transport choice reaches devices)

- `apps/server/src/endpoints/devices/downloadFirmware.ts` - fixed-length
  ASCII placeholder strings baked into firmware binaries are byte-patched on
  download (`replacePossiblySplitAscii`, values NUL-padded to placeholder
  length by `padAsciiToLength`), then ESP32 image checksum is recalculated
  (`recalculateEsp32Checksum`) / UF2 structure validated. Placeholders (lines
  15-21): OLD_TOKEN (32), OLD_SSID (32), OLD_PASS (63), OLD_HOST (32),
  OLD_PROJECT_ID (32), OLD_DEVICE_ID (32). `replacePossiblySplitAscii`
  THROWS if a placeholder is absent - relevant because already-published
  firmware binaries will not contain the new transport placeholder.
- `firmware/esp32/main/config.h` - `#define DEVICESDK_API_TOKEN "e343..."`
  etc.; `firmware/pico/CMakeLists.txt` lines 65-70 - same strings as compile
  definitions. Both firmwares `sanitize_credential(...)` the raw values at
  boot (NUL padding makes them valid C strings).
- Firmware message handling is ALREADY transport-agnostic:
  - ESP32: `firmware/esp32/main/websocket_handler.h` -
    `bool handle_websocket_message(const char *message)` parses JSON and
    queues worker commands; responses drain through a queue in
    `devicesdk_main.c` (find the response-drain loop that calls the WS send).
  - Pico: `firmware/pico/src/websocket_handler.h` -
    `handle_websocket_message(const picojson::value&)` +
    `websocket_handler_init(send_response_fn, ...)` where `send_response_fn`
    is `void (*)(const char* json)`.
  - ESP32 `main/CMakeLists.txt` has
    `PRIV_REQUIRES esp_websocket_client json esp_driver_gpio esp_wifi nvs_flash esp_netif`.
  - Pico `CMakeLists.txt` line 107 links `pico_cyw43_arch_lwip_threadsafe_background`,
    `pico_lwip`, etc.

### Packaging

- `Dockerfile` - stage 2 runs
  `bun build src/server.ts --target=bun --outfile /out/server.js`
  (workspace deps get inlined; the spike confirmed lazy dynamic import
  survives this). Runtime stage `EXPOSE 8080`.
- `apps/server/package.json` deps: `@devicesdk/core workspace:*`, chanfana,
  hono, workers-qb, zod. Tests: `bun test src tests` (script `test:e2e`).
- `packages/core/package.json` - `"build": "tsc"`, barrel
  `packages/core/src/index.ts` re-exports `./commands.js`, `./ha.js`, etc.
  Core has NO runtime deps (hard rule - types only for this plan).
- `packages/cli/package.json` - `"test": "tsc && vitest run"` (model for the
  new package's test setup).
- Tests: `apps/server/tests/harness.ts` boots a real `Bun.serve` on an
  ephemeral port and provides `DeviceSim` (a TypeScript stand-in for firmware
  over WS); `apps/server/tests/e2e/runtime-device.test.ts` is the pattern for
  device-runtime e2e tests.

### Repo conventions that apply

- Strict types, no `any`; validate all external input (MQTT usernames,
  topics, payloads) explicitly.
- Files under ~700 LOC; `crypto.randomUUID()` for IDs; `Date.now()` for
  timestamps.
- Bun-specific APIs only in `apps/server` - `packages/transport-mqtt` must
  use `node:net`, never `Bun.listen`.
- Never write em-dashes in any file; use " - " instead.
- Response format for REST errors: `{ "success": false, "error": "..." }`.
- TROUBLESHOOT.md warning that applies here: never run migration SQL through
  workers-qb Query objects (not needed - this plan adds NO migrations).

## Commands you will need

| Purpose | Command (from repo root) | Expected on success |
|---------|--------------------------|---------------------|
| Install | `pnpm install` | exit 0 |
| Build all | `pnpm build` | exit 0 |
| Server types | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server lint | `pnpm lint --filter @devicesdk/server` | exit 0 |
| Server unit tests | `pnpm test --filter @devicesdk/server` | all pass |
| Server e2e tests | `cd apps/server && bun test src tests` | all pass |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| MQTT pkg tests | `pnpm test --filter @devicesdk/transport-mqtt` | all pass |
| Root lint (pre-commit) | `pnpm lint` | exit 0 |
| Changeset | create files in `.changeset/` manually (format below) | CI changeset check passes |

Bun binary if needed directly: `/home/debian/.bun/bin/bun`.

## Scope

**In scope** (the only files you should create/modify):

- `packages/core/src/transport.ts` (create), `packages/core/src/index.ts`
  (add one export line)
- `packages/transport-mqtt/**` (create - new workspace package)
- `apps/server/src/config.ts`, `apps/server/src/server.ts`,
  `apps/server/src/types.d.ts`
- `apps/server/src/runtime/transportHost.ts` (create),
  `apps/server/src/runtime/transportLoader.ts` (create)
- `apps/server/src/foundation/auth.ts` (extract one helper, no behavior change)
- `apps/server/src/endpoints/devices/downloadFirmware.ts`
- `apps/server/package.json` (add dep + devDep)
- `apps/server/tests/e2e/runtime-mqtt.test.ts` (create),
  `apps/server/tests/unit/transport-loader.test.ts` (create),
  `apps/server/tests/e2e/firmware.test.ts` (extend)
- `packages/cli/src/config.ts`, `packages/cli/src/config.test.ts`,
  `packages/cli/src/commands/flash.ts`, `packages/cli/src/commands/flash.test.ts`,
  `packages/cli/src/api/devices.ts`
- `firmware/esp32/main/config.h`, `firmware/esp32/main/devicesdk_main.c`,
  `firmware/esp32/main/CMakeLists.txt`, `firmware/esp32/main/mqtt_handler.c`
  (create), `firmware/esp32/main/mqtt_handler.h` (create)
- `firmware/pico/CMakeLists.txt`, `firmware/pico/main.cpp`,
  `firmware/pico/src/mqtt_transport.cpp` (create),
  `firmware/pico/src/mqtt_transport.h` (create), `firmware/pico/lwipopts.h`
  (only if the MQTT app needs an option bump)
- `Dockerfile` (EXPOSE line + comment only), `docker-compose.yml`
  (commented port mapping)
- `docs/public/guides/self-hosting.md` and the CLI config docs page (locate
  with `grep -rln "deviceType" docs/public | head`)
- `.changeset/*.md` (new changeset files), `pnpm-lock.yaml` (via pnpm install)
- `plans/README.md` (status row update at the end)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/src/endpoints/devices/wsRoutes.ts` beyond OPTIONALLY typing
  against the shared contract - the WebSocket path must keep byte-identical
  behavior. Do NOT convert WebSocket into a loadable plugin.
- Watcher WebSockets, `useDeviceStream.ts`, the dashboard app - watchers stay
  WebSocket-only regardless of device transport.
- `packages/cli/src/simulator/**` and `devicesdk dev` - the simulator ignores
  the transport field.
- `packages/mcp`, `apps/simulation`, `apps/website` source (docs content
  under `docs/public/` is allowed).
- MQTT over TLS, QoS > 0, retained messages, MQTT 5 features, watcher-over-
  MQTT, versionId selection over MQTT (MQTT always runs the latest deployed
  version), Home Assistant MQTT discovery (that is plan 001's territory via
  REST/WS, and a possible future follow-up here).
- No database migrations. No changes to the device script contract.

## Git workflow

- Worktree + branch (never work in the main checkout, never commit to main):
  ```bash
  git worktree add .worktrees/mqtt-transport-plugin -b mqtt-transport-plugin
  ```
- Commit per step or logical unit; conventional-commit style, e.g.
  `feat(server): load device transport plugins behind MQTT_ENABLED`
  (match `git log --oneline -10` style).
- Run `pnpm lint` before every commit.
- Open a PR into `main` with `gh pr create --base main` ONLY if
  `git remote get-url origin` is `github.com/device-sdk/devicesdk`; otherwise
  stop after pushing nothing and report. PR body ends with the standard
  Claude Code attribution line used by this repo.

## The wire protocol (normative for steps 4, 8, 9, 10)

| Aspect | Value |
|--------|-------|
| Broker | embedded in server process, TCP, no TLS, port `MQTT_PORT` (default 1883) |
| MQTT version | 3.1.1 (aedes default; esp-mqtt and lwIP both speak it) |
| clientId | `{projectSlug}/{deviceSlug}` (must equal username; enables broker-native takeover = single-live-session rule) |
| username | `{projectSlug}/{deviceSlug}` |
| password | the device API token (same 32-hex token the firmware uses as Bearer today) |
| keepalive | 60 s (protocol-level PINGREQ; no app-level `{"type":"ping"}` frames over MQTT) |
| Device publishes to | `devicesdk/{projectSlug}/{deviceSlug}/up` |
| Device subscribes to | `devicesdk/{projectSlug}/{deviceSlug}/down` |
| QoS | 0 both directions (app-level ack map in DeviceSession already handles reliability; command timeout stays 5 s) |
| Payloads | exactly the same JSON frames as WebSocket, UTF-8 |
| Handshake | after CONNACK + SUBACK on `down`, device publishes `{"id":"","type":"device_connected","payload":{}}` on `up` |
| ACL | a client may ONLY publish to its own `up` topic and subscribe to its own `down` topic |
| Version | always the device's `current_version_id` at CONNECT time |

Baked firmware transport value (patched into the placeholder): the ASCII
string `websocket`, or `mqtt:<port>` (e.g. `mqtt:1883`), NUL-padded to 32
bytes. The broker host is the API host with any `:port` suffix stripped.

## Steps

### Step 1: Transport contract types in `@devicesdk/core`

Create `packages/core/src/transport.ts` (types only, zero runtime code
except a `const` array):

```ts
export const TRANSPORT_NAMES = ["websocket", "mqtt"] as const;
export type TransportName = (typeof TRANSPORT_NAMES)[number];

/** One live device connection, transport-agnostic (matches the server's RuntimeSocket). */
export interface TransportConnection {
    send(data: string): void;
    close(code?: number, reason?: string): void;
}

/** Per-device lifecycle hooks a transport drives - the generic transport pipe. */
export interface DeviceSessionHooks {
    deviceOpen(conn: TransportConnection): void;
    deviceMessage(conn: TransportConnection, data: string): void;
    deviceClose(conn: TransportConnection, code: number, reason: string): void;
    deviceError(conn: TransportConnection, error: unknown): void;
}

export interface TransportLogger {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(error: unknown, message: string, context?: Record<string, unknown>): void;
}

/** Host API the server hands to a transport plugin at start(). */
export interface TransportHost {
    /**
     * Verify a device credential and resolve its session. Returns null when
     * the token is invalid, the project/device does not exist for that user,
     * or the device has no deployed script version.
     */
    authenticateDevice(args: {
        token: string;
        projectSlug: string;
        deviceSlug: string;
    }): Promise<DeviceSessionHooks | null>;
    log: TransportLogger;
    /** Transport settings sourced from server env (e.g. { port: "1883" }). */
    settings: Record<string, string>;
}

export interface TransportHandle {
    stop(): Promise<void> | void;
}

export interface DeviceTransportPlugin {
    /** Short name for logs, e.g. "mqtt". */
    name: string;
    start(host: TransportHost): Promise<TransportHandle>;
}
```

Add `export * from "./transport.js";` to `packages/core/src/index.ts`
(match the existing barrel style and update its header comment list).

**Verify**: `pnpm build --filter @devicesdk/core && pnpm check-types --filter @devicesdk/core`
exits 0.

### Step 2: Server config + Env plumbing

In `apps/server/src/config.ts` add to `ServerConfig` (with doc comments
matching the existing style):

- `mqttEnabled: boolean` from `MQTT_ENABLED` via `parseBool(..., false)`
- `mqttPort: number` from `MQTT_PORT`, default `1883`
- `pluginsDir: string` from `PLUGINS_DIR`, default `join(dataDir, "plugins")`

**Verify**: `pnpm check-types --filter @devicesdk/server` exits 0.

### Step 3: Transport host + auth helper

3a. In `apps/server/src/foundation/auth.ts`, extract the API-token lookup
(the `hashToken` + `tokens t` join `user u` query quoted in "Current state")
into an exported helper, and call it from the existing middleware branch so
behavior is unchanged:

```ts
export async function resolveApiTokenUser(
    qb: BunSqliteQB,
    token: string,
    secret: string,
): Promise<tableUser | null>
```

3b. Create `apps/server/src/runtime/transportHost.ts`:

```ts
export function makeTransportHost(deps: {
    hub: DeviceHub;
    qb: BunSqliteQB;
    logger: ServerLogger;
    apiTokenSecret: string;
    settings: Record<string, string>;
}): TransportHost
```

`authenticateDevice` performs, in order (returning null on any miss):
1. `resolveApiTokenUser(qb, token, apiTokenSecret)` -> user
2. project by `(user_id = user.id, project_slug = projectSlug)` (same
   `qb.fetchOne` shape as `projectDeviceResolve.ts`)
3. device by `(project_id, device_slug = deviceSlug)`
4. `versionId = device.current_version_id`; null if unset
5. `device_scripts` row by `(version_id, device_id)` for `entrypoint`
   (same query as `wsRoutes.ts` lines 87-96)
6. Build the `DeviceMeta` exactly as `wsRoutes.ts` does (UUIDs for
   projectId/deviceId, slugs for projectSlug/deviceSlug), then return hooks
   bound to `hub.get(project.id, device.id)`:

```ts
const session = deps.hub.get(project.id, device.id);
return {
    deviceOpen: (conn) => session.handleDeviceOpen(conn, meta),
    deviceMessage: (conn, data) => session.handleDeviceMessage(conn, data),
    deviceClose: (conn, code, reason) => session.handleDeviceClose(conn, code, reason),
    deviceError: (conn, error) => session.handleDeviceError(conn, error),
};
```

`TransportConnection` and the server's `RuntimeSocket` are structurally
identical - no cast should be needed. If you find yourself needing `as`,
STOP (contract drift).

**Verify**: `pnpm check-types --filter @devicesdk/server && cd apps/server && bun test src tests`
exits 0 (existing auth tests still pass - the middleware refactor must be
behavior-neutral).

### Step 4: `@devicesdk/transport-mqtt` package

Scaffold `packages/transport-mqtt/` modeled on `packages/core` (build:
`tsc`, `dist/` output, `publishConfig.access: public` copied from core's
package.json) with tests modeled on `packages/cli` (`"test": "tsc && vitest run"`):

- `package.json`: name `@devicesdk/transport-mqtt`, version `0.0.0`,
  `"private": false`, license `AGPL-3.0-only`, deps: `aedes: "^1.1.1"`,
  `@devicesdk/core: "workspace:*"`; devDeps: `mqtt: "^5.15.1"`, `vitest`,
  `typescript: "catalog:"`, `@repo/typescript-config: "workspace:*"`.
- `src/index.ts`: default-export a `DeviceTransportPlugin`:

```ts
import { createServer, type Server, type Socket } from "node:net";
import { Aedes } from "aedes";
import type { DeviceSessionHooks, DeviceTransportPlugin, TransportConnection, TransportHost } from "@devicesdk/core";
```

Behavior (all normative details in "The wire protocol" above):

- `start(host)`: `const broker = await Aedes.createBroker({ authenticate })`,
  `createServer((socket: Socket) => broker.handle(socket))`, listen on
  `Number(host.settings.port ?? "1883")` on all interfaces (devices connect
  over LAN). Return `{ stop }` that closes broker + server.
- `authenticate(client, username, password, done)`:
  - `username` must be `projectSlug/deviceSlug` (exactly one `/`, both
    segments non-empty, each <= 64 chars) and `client.id === username`;
    otherwise `done(null, false)`.
  - `host.authenticateDevice({ token: password.toString(), projectSlug, deviceSlug })`;
    null -> `done(null, false)`. On success stash per-client state in a
    `Map<string /* client.id */, { hooks, conn, topics }>` where `conn` is
    ONE stable object per client:
    ```ts
    const conn: TransportConnection = {
        send: (data) => broker.publish({ cmd: "publish", topic: downTopic, payload: Buffer.from(data), qos: 0, retain: false, dup: false }, () => {}),
        close: () => client.close(),
    };
    ```
  - Wrap the async work in try/catch; any thrown error -> `done(null, false)`
    plus `host.log.error(...)`. Never let it reject unhandled.
- `authorizeSubscribe`: allow only the client's own `down` topic, else error.
- `authorizePublish`: allow only the client's own `up` topic, else error.
- `broker.on("clientReady", ...)`: look up state, `hooks.deviceOpen(conn)`.
- `broker.on("publish", (packet, client) => ...)`: ignore `client == null`
  (broker-originated); if `packet.topic` is that client's `up` topic,
  `hooks.deviceMessage(conn, packet.payload.toString())`.
- `broker.on("clientDisconnect", ...)` and `broker.on("clientError", ...)`:
  `hooks.deviceClose(conn, 1000, "MQTT disconnect")` /
  `hooks.deviceError(conn, err)`, then delete the map entry. Double-fire is
  safe (DeviceSession ignores stale connection objects), but still guard the
  map lookup.
- Takeover needs NO plugin code: aedes disconnects the old client
  (spike-verified), which fires `clientDisconnect` (old) then the new
  client's `authenticate`/`clientReady`.

Register nothing in turbo config - `turbo.json` picks up workspace tasks
automatically. Run `pnpm install` after creating the package.

**Verify**: `pnpm install && pnpm build --filter @devicesdk/transport-mqtt`
exits 0.

### Step 5: Plugin package tests

`packages/transport-mqtt/src/index.test.ts` (vitest, uses the `mqtt`
client package, ephemeral ports, a fake `TransportHost` whose
`authenticateDevice` accepts one known token and records hook calls):

1. wrong password -> client gets "Not authorized"; `deviceOpen` never fires.
2. malformed username (no slash) -> rejected before `authenticateDevice`.
3. happy path: connect, subscribe `down`, publish handshake on `up` ->
   fake hooks record `deviceOpen` then `deviceMessage` with the exact JSON;
   `conn.send("...")` from the fake host side arrives on the client's `down`
   subscription.
4. ACL: subscribing to another device's `down` topic or publishing to
   another `up` topic fails / never reaches hooks.
5. takeover: second client with same clientId -> first client's
   `deviceClose` fires, second's `deviceOpen` fires.

**Verify**: `pnpm test --filter @devicesdk/transport-mqtt` -> 5+ tests pass.

### Step 6: Server transport loader + boot wiring

Create `apps/server/src/runtime/transportLoader.ts`:

```ts
export async function startTransports(deps: {
    config: ServerConfig;
    hub: DeviceHub;
    qb: BunSqliteQB;
    logger: ServerLogger;
}): Promise<TransportHandle[]>
```

- When `config.mqttEnabled`: `const mod = await import("@devicesdk/transport-mqtt");`
  then `mod.default.start(makeTransportHost({ ..., settings: { port: String(config.mqttPort) } }))`.
  A failure here is a fatal misconfiguration: log and `process.exit(1)`
  (the operator explicitly asked for MQTT).
- Scan `config.pluginsDir` (if it exists) for `*.js` files; for each,
  `await import(pathToFileURL(file).href)`, validate the default export has
  a string `name` and function `start` (log + skip otherwise - a bad
  third-party plugin must never kill the server), then `start(host)` inside
  try/catch (log + skip on error). Settings for dir plugins:
  `{ port: String(config.mqttPort) }` is fine for now.
- Add `@devicesdk/transport-mqtt: "workspace:*"` to `apps/server`
  dependencies and `mqtt: "^5.15.1"` to its devDependencies.
- In `apps/server/src/server.ts`: after the mDNS block, `const transports =
  await startTransports({ config, hub, qb, logger });` and in `shutdown()`
  add `for (const t of transports) void t.stop();` before `server.stop()`.
  Log one line per started transport (`logger.info("Transport started", { name })`).

Static-import discipline: `apps/server/src/**` must contain NO
`import ... from "aedes"` and no top-level
`import ... from "@devicesdk/transport-mqtt"` (type-only imports of core
contract types are fine; the plugin import must remain a dynamic
`import()` expression so the bundle stays lazy).

**Verify**:
- `pnpm check-types --filter @devicesdk/server` exits 0.
- `grep -rn "from \"aedes\"" apps/server/src` -> no matches.
- `grep -rn "^import .*transport-mqtt" apps/server/src` -> no matches.
- Manual boot check: `cd apps/server && bun run src/server.ts` -> log shows
  no MQTT transport; then `MQTT_ENABLED=1 bun run src/server.ts` -> log shows
  `Transport started` + `name: mqtt`, and `ss -tln | grep 1883` shows the
  listener. Ctrl-C exits cleanly both times.

### Step 7: Server unit + e2e tests for the loader and the full MQTT path

7a. `apps/server/tests/unit/transport-loader.test.ts` (bun test): default
config -> `startTransports` returns `[]` and opens no listener; a temp
`pluginsDir` containing a stub plugin file (write a tiny JS file whose
default export records `start` calls) -> loaded and started; a garbage JS
file alongside -> skipped without throwing.

7b. `apps/server/tests/e2e/runtime-mqtt.test.ts` (bun test, model the
scaffolding on `runtime-device.test.ts` + `harness.ts`): boot the harness,
create user/project/device, upload + deploy a script (use
`deviceScriptSource()` from the harness), create an API token via the tokens
endpoint, then `import mqttPlugin from "@devicesdk/transport-mqtt"` and
start it on an ephemeral port with `makeTransportHost` wired to the
harness's hub. Using the `mqtt` client package as the device:

1. connect with the API token + correct topics, publish `device_connected`
   -> device row shows `connected = 1` (REST status endpoint) and
   onDeviceConnect console output lands in device logs.
2. REST command endpoint (`handleCommand` path, e.g. get_pin_state) -> the
   mqtt "device" receives the command JSON on `down`, replies on `up` with
   the same `id` -> REST returns 200 with the response.
3. wrong token -> connection refused, device stays disconnected.
4. disconnect the mqtt client -> status endpoint flips to disconnected.

**Verify**: `cd apps/server && bun test src tests` -> all pass including the
new files. Also `pnpm lint --filter @devicesdk/server` exits 0.

### Step 8: CLI config option + firmware download pass-through

8a. `packages/cli/src/config.ts`: add to `DeviceConfigSchema`:

```ts
transport: z.enum(["websocket", "mqtt"]).default("websocket"),
```

(`.default()` keeps old `devicesdk.ts` files valid and gives downstream code
a non-optional value.)

8b. `packages/cli/src/api/devices.ts`: extend `downloadDeviceFirmware`
options to `{ host?: string; transport?: "websocket" | "mqtt" }` and include
`...(options?.transport ? { transport: options.transport } : {})` in the
POST body.

8c. `packages/cli/src/commands/flash.ts`: pass
`transport: deviceConfig.transport` at both `downloadDeviceFirmware` call
sites (lines ~136 and ~175). When the transport is `mqtt`, print one info
line: `MQTT transport selected - the server must run with MQTT_ENABLED=1`.

8d. Tests: extend `packages/cli/src/config.test.ts` (defaulting + rejection
of invalid values) and `packages/cli/src/commands/flash.test.ts` (body
includes `transport` when set to mqtt, omits/websocket by default - follow
the existing mock patterns in those files).

**Verify**: `pnpm test --filter @devicesdk/cli` -> all pass.

### Step 9: Server-side firmware patching

`apps/server/src/endpoints/devices/downloadFirmware.ts`:

- Add placeholder constant (32 chars, must byte-match Step 10/11 exactly):
  ```ts
  const OLD_TRANSPORT = "a41f8c02b5d94e17a3c6f0d82e9b4a56";
  ```
- Add optional body field `transport: z.enum(["websocket", "mqtt"]).optional()`.
- Compute patched value: `mqtt:<c.env.config.mqttPort>` when transport is
  `mqtt`, else `websocket`; pad with `padAsciiToLength(value, 32, "Transport")`.
- Patch tolerance for OLD binaries (published firmware that predates the
  placeholder): check presence first with the existing `findSequence` helper.
  If absent and transport is `mqtt`, return 400
  `{ success: false, error: "This firmware build predates MQTT transport support - rebuild or update firmware binaries", code: "FIRMWARE_TRANSPORT_UNSUPPORTED" }`.
  If absent and transport is websocket/omitted, skip the patch silently.
  Patch BEFORE the checksum recalculation (order with the other
  `replacePossiblySplitAscii` calls).
- Extend `apps/server/tests/e2e/firmware.test.ts`: craft the fake firmware
  fixture bytes to include the transport placeholder; assert (a) mqtt
  request patches it to `mqtt:1883` NUL-padded, (b) default request patches
  `websocket`, (c) fixture WITHOUT the placeholder + mqtt request -> 400
  with `FIRMWARE_TRANSPORT_UNSUPPORTED`, (d) placeholder-less fixture +
  default request still succeeds.

**Verify**: `cd apps/server && bun test src tests` -> all pass;
`cd apps/server && bun run scripts/generate-openapi.ts` regenerates
`openapi.json` (commit the diff - the website build consumes it).

### Step 10: ESP32 MQTT client

- `firmware/esp32/main/config.h`: add
  `#define DEVICESDK_TRANSPORT "a41f8c02b5d94e17a3c6f0d82e9b4a56"` with a
  comment matching the existing placeholder block.
- `firmware/esp32/main/CMakeLists.txt`: append `mqtt` to `PRIV_REQUIRES`
  (esp-mqtt is a built-in ESP-IDF component; no `idf_component.yml` change).
- New `main/mqtt_handler.c/.h`: initialize `esp_mqtt_client`
  (`mqtt_client.h`) with broker host = API host with any `:port` suffix
  stripped, port parsed from the transport value (`mqtt:1883` -> 1883,
  default 1883), `credentials.username` and `.client_id` =
  `"{project_id}/{device_id}"`, `.authentication.password` = api_token,
  keepalive 60, plain TCP. On `MQTT_EVENT_CONNECTED`: subscribe
  `devicesdk/{project}/{device}/down` (qos 0), then publish the
  `device_connected` handshake JSON on `.../up`. On `MQTT_EVENT_DATA`:
  reassemble fragmented payloads (esp-mqtt delivers `data_len` /
  `total_data_len` chunks - buffer until complete), NUL-terminate, call
  `handle_websocket_message(json)`. Outgoing responses: publish to the `up`
  topic - mirror how `devicesdk_main.c` drains the response queue for the
  WS path (find that drain loop and factor a `send via active transport`
  function pointer, or add a parallel drain branch; keep the WS path
  byte-identical).
- `devicesdk_main.c`: `sanitize_credential` the new
  `DEVICESDK_TRANSPORT` value like the others; if it starts with `"mqtt"`,
  start the MQTT client path instead of the WebSocket client, and skip the
  app-level ping loop (`DEVICESDK_PING_INTERVAL_MS`) - MQTT keepalive
  replaces it. `"websocket"`, empty, or unpatched placeholder value -> the
  existing WS path exactly as today (the placeholder string does not start
  with "mqtt", so unpatched images fall through safely).

**Verify**: the ESP32 CI workflow (`firmware-esp32.yml` builds on
`[self-hosted, linux, proxmox-ephemeral]`) must pass on the PR. If you have
no local ESP-IDF toolchain, do NOT try to install one - rely on CI and say
so in the PR description. Unit-testable JSON-handling logic should go
through the existing `UNIT_TEST` seams (see `websocket_handler.h`).

### Step 11: Pico MQTT client

- `firmware/pico/CMakeLists.txt`: add
  `DEVICESDK_TRANSPORT="a41f8c02b5d94e17a3c6f0d82e9b4a56"` to the compile
  definitions block (lines 65-70) and `pico_lwip_mqtt` to the
  `target_link_libraries` list at line 107.
- New `src/mqtt_transport.cpp/.h` using lwIP's MQTT app (`lwip/apps/mqtt.h`):
  `mqtt_client_new()`, `mqtt_connect_client_info_t` with client_id/user =
  `{project}/{device}`, pass = token, keep_alive 60;
  `mqtt_set_inpub_callback` to collect incoming `down` publishes (lwIP
  delivers topic then data fragments - reassemble), parse with picojson and
  call `handle_websocket_message(value)`; expose a
  `void mqtt_send_response(const char* json)` that publishes to `up` (qos 0)
  and wire it as the `send_response_fn` given to `websocket_handler_init`.
  All lwIP calls from the lwIP-safe context
  (`pico_cyw43_arch_lwip_threadsafe_background` - use
  `cyw43_arch_lwip_begin/end` around mqtt_* calls from the main loop, same
  discipline as the existing WS code in `main.cpp`).
- `main.cpp`: branch on the sanitized transport value exactly like the
  ESP32 (`starts with "mqtt"` -> MQTT path, else existing WS path
  untouched).

**Verify**: the Pico CI workflow must pass. If `pico_lwip_mqtt` does not
exist as a link target in the pinned pico-sdk version, STOP and report
(escape hatch below).

### Step 12: Packaging + docs + changesets

- `Dockerfile`: change `EXPOSE 8080` to `EXPOSE 8080 1883` with a one-line
  comment that 1883 is only bound when `MQTT_ENABLED=1`.
- `docker-compose.yml`: add a commented-out `# - "1883:1883"` line with a
  pointer comment, plus a commented `# MQTT_ENABLED: "1"` env example.
- `docs/public/guides/self-hosting.md`: document `MQTT_ENABLED`,
  `MQTT_PORT`, `PLUGINS_DIR` next to the existing `MDNS_ENABLED` docs, plus
  a short "Device transports" subsection: what MQTT mode changes, the topic
  scheme, and that the dashboard/watchers are unaffected.
- CLI config docs page (locate via `grep -rln "deviceType" docs/public`):
  document the per-device `transport` field, default `websocket`, and the
  matching server requirement.
- Changesets (create files in `.changeset/`, one per concern is fine).
  Format:
  ```md
  ---
  "@devicesdk/core": minor
  "@devicesdk/cli": minor
  "@devicesdk/server": minor
  "@devicesdk/transport-mqtt": minor
  "@devicesdk/website": patch
  ---

  Add MQTT as an optional device transport ...
  ```
  plus a separate changeset with `"@devicesdk/firmware-esp32": minor` and
  `"@devicesdk/firmware-pico": minor` (firmware changesets are MANDATORY -
  no changeset means the firmware never ships). No `major` bumps anywhere.

**Verify**: `pnpm build` exits 0 from the repo root; `pnpm lint` exits 0;
`ls .changeset/*.md` shows the new entries.

## Test plan

Summarized from the steps (all new tests listed there in detail):

- `packages/transport-mqtt/src/index.test.ts` (vitest): auth rejection,
  malformed username, both message directions, topic ACL, clientId takeover.
- `apps/server/tests/unit/transport-loader.test.ts` (bun test): disabled by
  default, plugin-dir loading, bad-plugin resilience.
- `apps/server/tests/e2e/runtime-mqtt.test.ts` (bun test): full device
  lifecycle over real MQTT against the real broker + real DeviceHub -
  connect/handshake, REST command round-trip with ack, bad token,
  disconnect status. Model on `runtime-device.test.ts`.
- `apps/server/tests/e2e/firmware.test.ts`: transport placeholder patching
  incl. old-binary tolerance and the 400 code.
- `packages/cli/src/config.test.ts` + `commands/flash.test.ts`: schema
  default + pass-through.
- Firmware: CI builds for both families; hardware validation is an OWNER
  step before merging the release PR (note it in the PR description).

## Done criteria

Machine-checkable. ALL must hold (from repo root unless noted):

- [ ] `pnpm build` exits 0
- [ ] `pnpm check-types --filter @devicesdk/server` exits 0
- [ ] `cd apps/server && bun test src tests` exits 0, including
      `runtime-mqtt.test.ts` and `transport-loader.test.ts`
- [ ] `pnpm test --filter @devicesdk/transport-mqtt` exits 0 (>= 5 tests)
- [ ] `pnpm test --filter @devicesdk/cli` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `grep -rn 'from "aedes"' apps/server/src` -> no matches
- [ ] `grep -rn '^import .*transport-mqtt' apps/server/src` -> no matches
- [ ] `grep -rn 'a41f8c02b5d94e17a3c6f0d82e9b4a56' apps/server/src firmware/esp32/main/config.h firmware/pico/CMakeLists.txt`
      -> exactly 3 files match (patcher + both firmwares)
- [ ] `MQTT_ENABLED` absent -> server boots with no listener on 1883;
      `MQTT_ENABLED=1` -> 1883 listens (manual check from Step 6 recorded in
      the PR description)
- [ ] `.changeset/` contains entries covering core, cli, server,
      transport-mqtt, website, firmware-esp32, firmware-pico
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row for 007 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes in `apps/server/src/runtime/` or
  `wsRoutes.ts` that contradict the excerpts above (another plan or PR may
  have refactored the runtime).
- `Aedes.createBroker` / the aedes event surface does not match the
  spike facts (aedes released a breaking version; pin `1.1.1` exactly and
  report).
- Wiring the transport host requires casting between `TransportConnection`
  and `RuntimeSocket`, or requires touching `deviceSession.ts` itself - the
  contract was designed to fit without modifying the session; a needed
  change there means the design assumption broke.
- `pico_lwip_mqtt` is not an available link target, or ESP-IDF's `mqtt`
  component is missing in the pinned toolchain - do not vendor an MQTT
  client; report which library is missing so the owner can decide.
- The firmware CI base image lacks a required system package - per repo
  policy, ask the owner to add it to the Proxmox image; no sudo workarounds.
- The transport placeholder string collides with existing bytes in a real
  firmware binary (patcher finds it more than once) - pick a new 32-char
  hex string and update all three locations, but report the collision.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **The contract in `@devicesdk/core` is now public API** for third-party
  transport plugins (`DATA_DIR/plugins/`). Breaking it later needs a major
  bump discussion. Keep it minimal - resist adding server internals to
  `TransportHost`.
- **Token rotation on firmware download** (downloadFirmware.ts rotates the
  device token every download) applies to MQTT identically - a reflashed
  device invalidates the old token, and a connected MQTT device will be
  rejected on its next reconnect, same as WS today.
- The MQTT path always runs the **latest deployed version**; if versionId
  pinning over MQTT is ever wanted, encode it in the CONNECT username and
  extend `authenticateDevice`.
- Reviewers should scrutinize: the ACL hooks in the plugin (a device must
  never publish/subscribe cross-device), that `wsRoutes.ts` behavior is
  untouched, that the loader cannot crash the server on a bad plugin file,
  and that no `aedes` static import crept into `apps/server/src`.
- Deferred follow-ups (intentionally out of scope): MQTT over TLS, QoS 1,
  MQTT-based Home Assistant discovery (compose with plan 001 later), watcher
  streams over MQTT, converting the built-in WebSocket transport to the
  plugin interface.
- If a future plan adds broker clustering or external-broker support, the
  `DeviceSessionHooks` contract is the seam - the session layer must never
  learn transport specifics.

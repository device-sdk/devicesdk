# Plan 008: Serve TLS by default and pin the server certificate in device firmware

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src apps/server/tests packages/cli/src firmware/esp32/main firmware/pico apps/dashboard/src/config Dockerfile docs/public`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (deliberate breaking change to the default transport; embedded TLS on two microcontroller stacks)
- **Depends on**: none. Coordination note: plans 006 and 007 also touch `firmware/esp32/main/devicesdk_main.c` and `firmware/pico/main.cpp`; if executed near them, land sequentially to avoid merge conflicts.
- **Category**: security
- **Planned at**: commit `bbd724d`, 2026-07-06

## Owner decisions baked into this plan (2026-07-06)

These were decided explicitly by the project owner; do not re-litigate them:

1. **TLS is the default and exclusive mode.** New env var `TLS_ENABLED`
   defaults to **true**. When true (or unset), the server's single listener on
   `PORT` speaks **only** TLS (HTTPS + WSS). When `TLS_ENABLED=false`, the
   listener speaks **only** plain HTTP (today's behavior). Never both at once,
   never a second port. This is a known breaking change; the software is not
   yet widely used and the owner accepted the break.
2. **Certificate generation is in-house and zero-dependency** (WebCrypto +
   a minimal DER/X.509 writer), matching the repo's zero-dep mDNS responder
   precedent (`apps/server/src/foundation/mdns/`). Shelling out to `openssl`
   was rejected (bare-metal installs cannot rely on it); an npm dependency was
   rejected (candidates are unmaintained; the owner wants no heavy static deps).
3. **Device trust = certificate pinning, not PKI.** The server's cert PEM is
   patched into firmware images at download time through the existing
   fixed-length-placeholder mechanism. Devices skip hostname verification and
   trust exactly that certificate. The CLI pins the cert on first login
   (trust-on-first-use). Browsers hitting the dashboard see a one-time
   self-signed-certificate interstitial; that is accepted and documented.

## Why this matters

Every self-hosted deployment today runs the device WebSocket, the dashboard,
and the CLI over plain HTTP on port 8080: both firmwares deliberately pick
`ws://` whenever the configured host contains an explicit port (the standard
self-hosted case), so device bearer tokens, user scripts' command traffic, and
session cookies cross the LAN in cleartext. After this plan, a stock install
encrypts everything by default with zero user configuration: the server
generates a persistent self-signed certificate on first boot, serves only TLS,
and every firmware image downloaded from it carries the pinned certificate so
devices verify they are talking to *their* server. Users who explicitly opt
out (`TLS_ENABLED=false`) get exactly today's plain-HTTP behavior.

## Current state

### Server

- `apps/server/src/config.ts` - env-driven `ServerConfig`; no TLS fields today.
  Pattern to match (`config.ts:76-85`):

  ```ts
  port: Number.parseInt(env.PORT || "8080", 10),
  ...
  secureCookies: parseBool(env.SECURE_COOKIES, false),
  ```

- `apps/server/src/server.ts:63-69` - single plain listener:

  ```ts
  const server = Bun.serve({
      port: config.port,
      fetch: (req) => app.fetch(req, services),
      websocket,
  });
  // hono's bun adapter resolves the server from c.env.server for WS upgrades.
  services.server = server;
  ```

  `Bun.serve` accepts `tls: { cert: string, key: string }`; a TLS listener
  still performs WebSocket upgrades through the same `websocket` handler, so
  the `services.server` wiring is unchanged.

- `apps/server/src/index.ts:139` - unauthenticated health route pattern:

  ```ts
  app.get("/health", (c) => c.json({ success: true, result: { status: "ok" } }));
  ```

- `apps/server/src/endpoints/devices/downloadFirmware.ts:15-28` - six
  fixed-length ASCII placeholders are located in the prebuilt firmware binary
  and overwritten in-memory before streaming (`padAsciiToLength` zero-pads,
  so firmware sees C strings). `downloadFirmware.ts:79`: the patched host
  defaults to `new URL(c.req.url).host` (the host the CLI used, port
  included). ESP32 images get their checksum recomputed after patching
  (`recalculateEsp32Checksum`); UF2 needs structure validation only.
- `apps/server/src/types.d.ts` - the `Env` services interface (`SCRIPTS`,
  `FIRMWARES`, `DEVICE`, `qb`, `DB`, `ENV`, `config`, `server`).
- `apps/server/tests/harness.ts:335` - `TestServer` builds its own
  `Bun.serve` (no TLS) and does not go through `src/server.ts`, so existing
  e2e suites are unaffected by boot changes.
- `apps/server/tests/e2e/firmware.test.ts` - builds synthetic ESP32/UF2 blobs
  containing all placeholders (`PLACEHOLDERS` concat at line 14) and asserts
  the download endpoint patches them. Model new firmware tests on this file.
- `apps/server/tests/unit/firmware-checksum.test.ts` - unit-test pattern.
- Zero-dep wire-codec precedent to imitate:
  `apps/server/src/foundation/mdns/dnsPacket.ts` (pure codec) +
  `responder.ts` (thin runtime wrapper).

### Firmware

- `firmware/esp32/main/config.h` - fixed-length placeholder macros
  (`DEVICESDK_API_HOST` etc.) with a comment explaining the patch contract.
- `firmware/esp32/main/devicesdk_main.c:475-489` - scheme selection:

  ```c
  const bool use_tls = (strchr(api_host, ':') == NULL);
  snprintf(uri, sizeof(uri), "%s://%s%s", use_tls ? "wss" : "ws", api_host, ws_path);
  ...
  .transport = use_tls ? WEBSOCKET_TRANSPORT_OVER_SSL : WEBSOCKET_TRANSPORT_OVER_TCP,
  .crt_bundle_attach = use_tls ? esp_crt_bundle_attach : NULL,
  ```

  Raw placeholder arrays are copied through `sanitize_credential()`
  (strips NUL padding) at `devicesdk_main.c:565-570`.
- `firmware/pico/lib/lwip_ws/ws_client.cpp:38-51` - same heuristic: host
  containing `:` means plain TCP on that port; bare host means TLS on 443
  verified against the single embedded root in `firmware/pico/src/ca_cert.h`
  (Google Trust Services R4 - useless for self-signed certs).
  `ws_client.cpp:135-137` creates the TLS config:

  ```cpp
  tls_config = altcp_tls_create_config_client(ca_cert_pem, ca_cert_pem_len);
  ```

  Neither firmware calls `mbedtls_ssl_set_hostname` anywhere (verified by
  grep), i.e. today's Pico TLS path does chain verification only.
- `firmware/pico/main.cpp:283,362,418` - `API_HOST` from the CMake-defined
  placeholder macro; `client.connect(api_host, ws_path, WEBSOCKET_TOKEN)` at
  two call sites (initial connect and reconnect).
- `firmware/pico/mbedtls_config.h:13` has `MBEDTLS_HAVE_TIME` but **not**
  `MBEDTLS_HAVE_TIME_DATE`, so the Pico skips certificate validity-period
  checks. Neither firmware runs SNTP, so device clocks are NOT synced - the
  generated certificate must be valid across all time (see Step 2).
- Firmware placeholders on the Pico come from
  `firmware/pico/CMakeLists.txt:57-69` compile definitions (short strings
  only; the 2 KB CA region goes in a dedicated source file instead).

### CLI

- `packages/cli/src/api/shared.ts:22-26` - `normalizeHost` defaults to
  `http://`; `getApiUrl()` precedence: `DEVICESDK_API_URL` env, `--host`
  override, `~/.devicesdk/credentials.json` host, mDNS. `request()` at
  line 220 uses the global `fetch` with no TLS options.
- `packages/cli/src/commands/logs.ts:1,122` - uses the `ws` package
  (`new WebSocket(url, {...})`) for the watch stream.
- `packages/cli/src/credentials.ts` - reads/writes
  `~/.devicesdk/credentials.json`.
- CLI runs on plain Node (vitest tests), never Bun APIs.

### Dashboard

- `apps/dashboard/src/config/apiHost.ts` - same-origin in production,
  `http://localhost:8080` dev fallback; `WS_API_HOST` derives the scheme from
  `API_HOST` (`replace(/^http/, 'ws')`), so the dashboard follows TLS
  automatically once served over HTTPS. Only the dev fallback needs updating.

### Docker

- `Dockerfile` final stage healthcheck (plain HTTP only today):

  ```dockerfile
  HEALTHCHECK ... CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health')..."
  ```

### Conventions that apply

- Response envelope: `{ "success": true, "result": ... }`.
- Strict types, no `any`; validate env/input at boundaries.
- Files under ~700 LOC; IDs via `crypto.randomUUID()`; epoch-ms timestamps.
- **No em-dashes anywhere in committed text.**
- Bun-specific APIs only inside `apps/server`.

## Commands you will need

| Purpose | Command (from repo root) | Expected on success |
|---------|--------------------------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server typecheck | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server lint | `pnpm lint --filter @devicesdk/server` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| Dashboard typecheck | `pnpm check-types --filter @devicesdk/dashboard` | exit 0 |
| Full lint (pre-commit, repo rule) | `pnpm lint` | exit 0 |
| Changeset | `pnpm changeset` (or write `.changeset/*.md` by hand) | file created |

Firmware cannot be compiled locally in this environment (no ESP-IDF or
pico-sdk toolchain). Firmware verification happens in CI
(`.github/workflows/firmware-esp32.yml`, `firmware-pico.yml`) after the PR is
opened, and hardware validation is an explicit owner step before merge (same
convention as plan 006).

## Scope

**In scope** (the only files you should modify or create):

- `apps/server/src/foundation/tls/selfSignedCert.ts` (create)
- `apps/server/src/foundation/tls/certStore.ts` (create)
- `apps/server/src/config.ts`
- `apps/server/src/server.ts`
- `apps/server/src/types.d.ts`
- `apps/server/src/index.ts`
- `apps/server/src/endpoints/devices/downloadFirmware.ts`
- `apps/server/tests/unit/tls-cert.test.ts` (create)
- `apps/server/tests/e2e/tls.test.ts` (create)
- `apps/server/tests/e2e/firmware.test.ts` (extend)
- `apps/server/tests/harness.ts` (small extension only, see Step 6)
- `Dockerfile` (HEALTHCHECK line only)
- `packages/cli/src/api/shared.ts`
- `packages/cli/src/api/tlsPin.ts` (create)
- `packages/cli/src/api/tlsPin.test.ts` (create) + `packages/cli/src/api/__fixtures__/` (create)
- `packages/cli/src/api/mdnsDiscovery.ts` (scheme of the returned URL only)
- `packages/cli/src/credentials.ts`
- `packages/cli/src/commands/login.ts`
- `packages/cli/src/commands/logs.ts`
- `packages/cli/package.json` (add `undici`)
- `firmware/esp32/main/pinned_ca.h` + `pinned_ca.c` (create)
- `firmware/esp32/main/devicesdk_main.c`
- `firmware/esp32/main/CMakeLists.txt` (register the new source)
- `firmware/pico/src/pinned_ca.h` + `pinned_ca.c` (create)
- `firmware/pico/lib/lwip_ws/ws_client.h` + `ws_client.cpp`
- `firmware/pico/main.cpp`
- `firmware/pico/CMakeLists.txt` (register the new source)
- `firmware/pico/mbedtls_config.h` (only if Step 12's investigation requires it)
- `apps/dashboard/src/config/apiHost.ts` (dev fallback URL only)
- `docs/public/guides/self-hosting.md`, `docs/public/guides/security.md`,
  `docs/public/quickstart.md`, `docs/public/first-device.md` (TLS wording)
- `.changeset/tls-by-default.md` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `packages/core` - no TLS code belongs in the published user-script surface.
- `packages/mcp`, `apps/simulation`, `packages/cli/src/simulator/` - the
  `devicesdk dev` simulator stays plain-local; MCP inherits CLI behavior.
- `apps/server/src/foundation/mdns/` - mDNS advertises a hostname, not a
  scheme; nothing to change.
- The watch WebSocket protocol frames and `useDeviceStream.ts` - scheme
  derivation is already generic.
- `firmware/pico/src/ca_cert.h` - the public-CA path for bare hostnames
  stays as-is.
- `docker-compose.yml` port mappings - the port does not change.
- Any second listener / dual-protocol serving - explicitly rejected by the
  owner (single listener, mode chosen by `TLS_ENABLED`).
- Response envelope shapes and existing endpoint contracts.

## Git workflow

- Work in a dedicated worktree (repo rule, never the main checkout):
  `git worktree add .worktrees/tls-by-default -b tls-by-default`
- Conventional-commit style, e.g. `feat(server): serve TLS by default with a
  self-signed pinned certificate` (see `git log --oneline -10` for tone).
- Run `pnpm lint` before every commit (repo rule).
- Open a PR into `main` with `gh pr create --base main` **only if** `git
  remote get-url origin` points at `github.com/device-sdk/devicesdk`;
  otherwise stop after committing and report.

## The pinned-CA placeholder constant

A new seventh placeholder region, 2048 ASCII bytes, must appear **byte-for-byte
identically** in four places: the server patcher, the server e2e test, the
ESP32 firmware, and the Pico firmware. It is the concatenation of these 32
lines of 64 hex chars each (no newlines in the final value; total length
exactly 2048):

```
0d884b5ff49a5520cd00307566ab6d39e3eb5f9a03eef80bcd4025e3a762d34e
bbe1de538e780eb4701315c10705deb97dedb6922e769fcf74b87a0be0edc41e
ef086b6bd0ec78a63d21ea137cf6a72a5febbb62562a8eff26f91295cff57377
2d2ac9088646837be21d1b741f3dd1df5ae22ea5837a74fdf86f79bb31fe8a8e
4aaecc7eb81615495d02fefe2e7456699b9a01732cf4961b5547b49917bef7ba
c3946745012638667bcbde78fe0efe324f22ed1754f7549999e7153d82fc4457
308332dcdde7963a0df84190a7f34530a3b6446eb043367e214622c711242b87
ba70459518adec0d80c0c99565ccf3e75352ed2936246dfa8d229795fcd971f0
e7ca4e2e81f8143416ed6d75e32abb51f21b48f239b779c9460e214768878db2
94ab39ad0996605addce7f0f79117f9cf45e37fb291fd1c1ac2f7bb517034157
9262f05cb98afca1740d7562de2cf8fee9f80477b3bcf4bea3f596acb7f1039e
73a3e58fc4c000ff4d7925b306f30e83b3b4d955a41411bcb38dfdc77a3ca83b
6090fba466dc5bb1e132890a5c4ee7a1f6819943157f06905a5ed94f8755a92a
e374984723821691659b536c9d11dfcf7fd7a76b6e1d4ffbb8eafa39e27995c4
1eb5c73f0a9b6f782ed9cc49e4ac90687b6a12a7281189505ca008c4e6bb4879
ecc30d3e961cabb0b1ad64affbb18666d6f91c87f573f5c49d8c0941d4ec77b5
c03251652f65812156b354f51c8c4e515ea195c5b0d5898bd40dfa3f9c7000b5
c40fdcd6c52af6c2ec853cd16018c61924a9673c2a0c6419847afb6993d907a1
2831b4fd864c72884924291c60e8d445519d73e994b3800e125957eeec86552a
077d6841ea69722c349aa4c7cec92d69d3c6cc3c3598531abc11a615a8cc8040
929763572fd52180b1c4dab064011cf0aa6c89d79ad5d4129571f7a83a7a94ed
1ab8f2dc7ae550bdf01162a09e87ef784bf4c4285163f3140927689402ea4228
f9a86a761b1516db24e401e88c4be443c43b93e23a752e1e0c276618e634962d
b9eeea0763886aa5f8881cbab64a8def2995feebb348c34ccc500f3bc15732a6
eb09830f5869e5653c1b3d085a7058f9127c56adfbfc7600d348b773f84c2b16
d7dc7fc7e94559de090e3f1d712c0fd4a1aa69fab508a3ce0a24523543d0822d
958e8be4378cbd4b6494e25f19e4643c05227cf50d5179a65949d853b3032881
9a1cf66cf3817dd360e7483f0db4cf3577f44f3908af884dd884a09dbb86c69b
5be62ae1868c5d978ab2c46f376057700dc190d1929d41bb27e71cc5f097e8da
e25df2a56a463c3af07870593fadd77407022c7b626c5d074034e49c5affcb84
53c67613999d133c50d384ccd3cefadbd74ae74238ac293678caeb77c0ece358
d6b06f81634ba77a4e2169eb8475c333a5d410817ac222c48f09940fb3226e14
```

In TypeScript, build it as a template-free concatenation of the 32 string
lines (mirroring how `firmware.test.ts` inlines placeholder constants). In C,
declare it as 32 adjacent string literals so the compiler produces one
contiguous 2049-byte array (2048 chars + implicit NUL):

```c
/* pinned_ca.h */
extern const char DEVICESDK_PINNED_CA[2049];
/* pinned_ca.c */
const char DEVICESDK_PINNED_CA[2049] =
    "0d884b5ff49a5520cd00307566ab6d39e3eb5f9a03eef80bcd4025e3a762d34e"
    "bbe1de538e780eb4701315c10705deb97dedb6922e769fcf74b87a0be0edc41e"
    /* ... all 32 lines ... */
    "d6b06f81634ba77a4e2169eb8475c333a5d410817ac222c48f09940fb3226e14";
```

The server always overwrites this region on download: with the
zero-padded server certificate PEM when TLS is on, or with 2048 zero bytes
when TLS is off. Firmware decides "pinned TLS mode" by checking whether the
region starts with `'-'` (PEM `-----BEGIN CERTIFICATE-----`).

## Steps

### Step 1: Add TLS fields to `ServerConfig`

In `apps/server/src/config.ts`:

- Add to the interface (with doc comments in the existing style):
  - `tlsEnabled: boolean` - "Serve HTTPS/WSS only (default). Set
    TLS_ENABLED=false to serve plain HTTP only."
  - `tlsCertFile: string` and `tlsKeyFile: string` - optional user-provided
    PEM paths (`TLS_CERT_FILE`, `TLS_KEY_FILE` env; empty string = generate).
  - `tlsDir: string` - where generated material persists.
- In `loadConfig`:

  ```ts
  const tlsEnabled = parseBool(env.TLS_ENABLED, true);
  ```

  set `tlsCertFile: env.TLS_CERT_FILE || ""`, `tlsKeyFile: env.TLS_KEY_FILE || ""`,
  `tlsDir: join(dataDir, "tls")`, and change the `secureCookies` fallback from
  `false` to `tlsEnabled` (Secure cookies are correct whenever the origin is
  HTTPS; an explicit `SECURE_COOKIES` env still wins).

**Verify**: `pnpm check-types --filter @devicesdk/server` exits 0.

### Step 2: Zero-dependency self-signed certificate generator

Create `apps/server/src/foundation/tls/selfSignedCert.ts` exporting:

```ts
export interface GeneratedCert { certPem: string; keyPem: string; }
export async function generateSelfSignedCert(opts: { commonName: string; sanDnsNames: string[]; sanIps: string[] }): Promise<GeneratedCert>
```

Implementation contract (WebCrypto + hand-rolled DER, no imports beyond
`node:crypto` for nothing - `crypto.subtle` and `crypto.getRandomValues` are
global in Bun):

- Key: `crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])`.
  Export public key as SPKI DER (`exportKey("spki")`) and private key as
  PKCS#8 DER (`exportKey("pkcs8")`).
- Build `TBSCertificate` (DER SEQUENCE) with:
  - `[0] EXPLICIT` version = INTEGER 2 (v3);
  - serialNumber = 16 random bytes with the top bit cleared (positive INTEGER);
  - signature algorithm = SEQUENCE { OID 1.2.840.10045.4.3.2 } (ecdsa-with-SHA256, no parameters);
  - issuer = subject = one RDN: CN (OID 2.5.4.3) as UTF8String `opts.commonName`;
  - **validity = notBefore UTCTime `700101000000Z`, notAfter GeneralizedTime
    `99991231235959Z`.** This is load-bearing: neither firmware syncs its
    clock (no SNTP anywhere; verified), so an ESP32 sits at 1970 and would
    reject any cert with a contemporary notBefore. RFC 5280 requires UTCTime
    for dates before 2050 and GeneralizedTime after; 99991231235959Z is the
    RFC 5280 "no well-defined expiration" value.
  - subjectPublicKeyInfo = the exported SPKI DER verbatim;
  - `[3] EXPLICIT` extensions:
    - basicConstraints (2.5.29.19), critical, `SEQUENCE { BOOLEAN TRUE }`
      (cA=true - required so mbedTLS and esp-tls accept the cert as its own
      trust anchor);
    - keyUsage (2.5.29.15), critical, BIT STRING with digitalSignature (bit 0)
      and keyCertSign (bit 5) set;
    - subjectAltName (2.5.29.17): dNSName entries (context tag `[2]`,
      IA5String) for each of `opts.sanDnsNames`, iPAddress entries (context
      tag `[7]`, 4 raw bytes) for each of `opts.sanIps`.
- Sign the TBS DER with `crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ...)`.
  WebCrypto returns a raw 64-byte P1363 `r||s` signature; convert each 32-byte
  half to a DER INTEGER (strip leading zero bytes, prepend `0x00` if the high
  bit is set), wrap both in a SEQUENCE, and embed that as the certificate's
  BIT STRING (zero unused bits).
- Certificate = SEQUENCE { tbs, sigAlg SEQUENCE, BIT STRING }.
- PEM-encode: base64 in 64-char lines between
  `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----` and
  `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`.

Keep DER helpers (`derSequence`, `derInteger`, `derOid`, `derBitString`, ...)
as private functions in this file; if the file approaches 700 LOC, split the
helpers into `apps/server/src/foundation/tls/der.ts`.

Write `apps/server/tests/unit/tls-cert.test.ts` (pattern:
`tests/unit/firmware-checksum.test.ts`) covering:

1. `node:crypto`'s `X509Certificate` parses the PEM: subject contains the CN,
   `cert.ca === true`, `subjectAltName` contains the DNS names and IP,
   `validTo` contains `9999`.
2. The authoritative gate - a real handshake: start
   `Bun.serve({ port: 0, tls: { cert, key }, fetch: () => new Response("ok") })`,
   then `node:tls.connect({ port, host: "127.0.0.1", ca: certPem,
   rejectUnauthorized: true, checkServerIdentity: () => undefined })` fires
   `secureConnect`. This proves generated material is accepted end-to-end by
   a strict verifier using the cert as its only trust anchor, exactly like a
   pinned device.
3. Two invocations produce different serials/keys.

If Bun's `X509Certificate` implementation turns out to lack a field the test
needs, drop that single assertion and rely on the handshake test; note it in
the PR description.

**Verify**: `pnpm test --filter @devicesdk/server` - new unit tests pass.

### Step 3: Certificate store (generate once, persist, allow user override)

Create `apps/server/src/foundation/tls/certStore.ts`:

```ts
export interface TlsMaterial { certPem: string; keyPem: string; }
export async function loadOrCreateTlsMaterial(config: ServerConfig, logger: ServerLogger): Promise<TlsMaterial>
```

- If `config.tlsCertFile` and `config.tlsKeyFile` are both set: read both
  files, return them (throw a clear startup error naming the missing file
  otherwise). Setting only one of the two is a startup error.
- Else look for `join(config.tlsDir, "cert.pem")` and `key.pem`; if both
  exist and are non-empty, return them.
- Else `mkdirSync(tlsDir, { recursive: true })`, call
  `generateSelfSignedCert({ commonName: "DeviceSDK self-hosted server",
  sanDnsNames: [config.mdnsHostname + ".local", "localhost"],
  sanIps: ["127.0.0.1"] })`, write `cert.pem` (0644) and `key.pem`
  (**mode 0600**, same idiom as `loadOrCreateApiTokenSecret` in
  `config.ts:50-68`), log one info line with the certificate's SHA-256
  fingerprint, and return it.

Compute the fingerprint as SHA-256 over the DER (base64 body of the PEM),
formatted as uppercase colon-separated hex; export a small
`certFingerprintSha256(certPem: string): string` helper from this file (the
endpoint in Step 5 and the CLI docs reuse the format).

**Verify**: `pnpm check-types --filter @devicesdk/server` exits 0; unit test
added in `tls-cert.test.ts`: calling `loadOrCreateTlsMaterial` twice against
a temp `DATA_DIR` returns identical PEMs (persistence), and the key file mode
is 0600.

### Step 4: Boot the server in TLS-only or plain-only mode

In `apps/server/src/server.ts`:

- After constructing `services` and before `Bun.serve`, add:

  ```ts
  const tlsMaterial = config.tlsEnabled
      ? await loadOrCreateTlsMaterial(config, logger)
      : undefined;
  if (tlsMaterial) services.tlsCertPem = tlsMaterial.certPem;
  ```

  (Top-level await is fine; `server.ts` is a Bun entry module.)
- Pass `tls: tlsMaterial ? { cert: tlsMaterial.certPem, key: tlsMaterial.keyPem } : undefined`
  to `Bun.serve` and change the startup log line to use `https://` vs
  `http://` accordingly, adding `tls: config.tlsEnabled` to its metadata.
- In `apps/server/src/types.d.ts`, add `tlsCertPem?: string` to the `Env`
  services interface with a comment: "PEM of the serving certificate when TLS
  is enabled; patched into firmware downloads for device pinning."

Manual smoke check (run from `apps/server`):

```bash
DATA_DIR=$(mktemp -d) bun run src/server.ts &
sleep 2
curl -sk https://localhost:8080/health   # expect {"success":true,...}
curl -s  http://localhost:8080/health    # expect a TLS/protocol error, NOT a 200
kill %1
```

Then the opt-out mode:

```bash
DATA_DIR=$(mktemp -d) TLS_ENABLED=false bun run src/server.ts &
sleep 2
curl -s http://localhost:8080/health     # expect {"success":true,...}
kill %1
```

**Verify**: both smoke checks behave as annotated; `pnpm lint --filter
@devicesdk/server` exits 0.

### Step 5: Public certificate endpoint + Docker healthcheck

- In `apps/server/src/index.ts`, next to `/health` (line 139), add an
  unauthenticated route:

  ```ts
  app.get("/v1/server/tls-cert", (c) =>
      c.env.tlsCertPem
          ? c.json({ success: true, result: { cert: c.env.tlsCertPem, fingerprint_sha256: certFingerprintSha256(c.env.tlsCertPem) } })
          : c.json({ success: false, error: "TLS is disabled on this server" }, 404),
  );
  ```

  The certificate is public material; no auth needed. Users download it here
  to import into an OS/browser trust store; docs link to it.
- In `Dockerfile`, replace the HEALTHCHECK command with one that works in
  both modes (Bun's `fetch` accepts a `tls.rejectUnauthorized` option):

  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
      CMD bun -e "const p = process.env.PORT || 8080; const ok = r => r.ok ? process.exit(0) : process.exit(1); fetch('https://localhost:' + p + '/health', { tls: { rejectUnauthorized: false } }).then(ok).catch(() => fetch('http://localhost:' + p + '/health').then(ok).catch(() => process.exit(1)))"
  ```

**Verify**: with the Step 4 TLS smoke server running,
`curl -sk https://localhost:8080/v1/server/tls-cert` returns
`{"success":true,...}` containing a PEM; `pnpm lint` exits 0.

### Step 6: Patch the pinned certificate into firmware downloads

In `apps/server/src/endpoints/devices/downloadFirmware.ts`:

- Add `const OLD_CA = "<the 2048-char placeholder>"` (concatenate the 32
  lines exactly) and `const CA_LENGTH = 2048;` with a comment pointing at
  `firmware/esp32/main/pinned_ca.c` and `firmware/pico/src/pinned_ca.c`.
- After the existing six replacements, patch the CA region **contiguously
  only** (do not use the split fallback: a 2 KB array literal is always
  contiguous in `.rodata`, and a 2047-way split scan over a multi-MB image is
  pathological). Add a small `replaceContiguousAscii(bytes, oldStr, newBytes,
  label)` next to the existing helpers that throws
  `ApiException("<label> placeholder not found in firmware")` when absent.
- Behavior matrix:
  - TLS on (`c.env.tlsCertPem` set): `caBytes = padAsciiToLength(certPem, CA_LENGTH, "PinnedCA")`.
    If the PEM exceeds 2048 bytes (possible only with a user-provided
    `TLS_CERT_FILE` chain), return 400 with
    `"TLS certificate is too large to pin into firmware (max 2048 bytes). Use a single EC certificate, or set TLS_ENABLED=false."`
  - TLS off: `caBytes = new Uint8Array(CA_LENGTH)` (all zeros).
  - Placeholder missing from the binary **and TLS on**: return 409 with
    `"This firmware build predates TLS pinning. Publish updated firmware or set TLS_ENABLED=false."`
    (published binaries older than this plan lack the region; flashing them
    against a TLS-only server would brick connectivity silently).
  - Placeholder missing **and TLS off**: skip silently (old binary, plain WS,
    still works).
- Do this **before** the ESP32 checksum recalculation, which must remain the
  last mutation (it hashes the patched bytes).
- The patched host stays `new URL(c.req.url).host` - the port does not change
  between modes, so no host adjustments are needed.

In `apps/server/tests/harness.ts`, allow tests to inject the cert: add an
optional `tlsCertPem?: string` to the `TestServer` options and thread it into
the services object it builds (mirroring how `config` is threaded). Do not
make `TestServer` actually serve TLS; the firmware patch path only reads
`c.env.tlsCertPem`.

Extend `apps/server/tests/e2e/firmware.test.ts`:

- Add `OLD_CA` (same constant) to `PLACEHOLDERS` so synthetic blobs contain
  the region.
- New tests: (a) with `tlsCertPem` injected, the downloaded blob contains the
  PEM bytes at the placeholder's offset, zero-padded to 2048, and no longer
  contains the placeholder; (b) without `tlsCertPem`, the region is all
  zeros; (c) with `tlsCertPem` injected but a blob built WITHOUT the CA
  placeholder, the endpoint returns 409; (d) the ESP32 checksum still
  validates after CA patching (existing checksum assertions keep passing).

**Verify**: `pnpm test --filter @devicesdk/server` - all pass including the
new firmware cases.

### Step 7: End-to-end TLS test

Create `apps/server/tests/e2e/tls.test.ts` (imports `app`, real services like
`harness.ts` does, but its own `Bun.serve` with `tls`):

1. Generate material with `generateSelfSignedCert`, boot
   `Bun.serve({ port: 0, tls: {...}, fetch: (req) => app.fetch(req, services), websocket })`
   with `services.tlsCertPem` and `services.server` set.
2. `fetch("https://localhost:" + port + "/health", { tls: { ca: certPem } })`
   returns 200 (Bun fetch accepts a `tls.ca` option; if it does not in the
   pinned Bun version, use `rejectUnauthorized: false` for this assertion -
   the strict pinned check is assertion 3).
3. Pinned WSS upgrade the way a device does it: open
   `node:tls.connect({ port, host: "127.0.0.1", ca: certPem,
   rejectUnauthorized: true, checkServerIdentity: () => undefined })`, write a
   raw HTTP/1.1 upgrade request for
   `/v1/projects/<p>/devices/<d>/connect/websocket` with a valid
   `Authorization: Bearer` token and `Sec-WebSocket-Key`, and assert the
   response starts with `HTTP/1.1 101`. Create the user/project/device/token
   through the HTTPS API first (reuse the registration + project setup
   sequence from `tests/e2e/core-flow.test.ts` as the pattern).
4. `GET /v1/server/tls-cert` over HTTPS returns the same PEM that was served.

**Verify**: `pnpm test --filter @devicesdk/server` - all pass.

### Step 8: CLI - default to https and pin on first login (TOFU)

All CLI work must stay Node-compatible (no Bun APIs). Add `undici` to
`packages/cli/package.json` dependencies (it is Node's own fetch engine;
pinning options require its `Agent`).

- `packages/cli/src/api/tlsPin.ts` (new):
  - `probeServerCertificate(url: string): Promise<{ pem: string; fingerprintSha256: string }>` -
    `node:tls.connect` to the URL's host/port with
    `rejectUnauthorized: false`, read `socket.getPeerCertificate(true).raw`,
    DER-to-PEM it, compute the fingerprint (same colon-hex format as the
    server).
  - `makePinnedDispatcher(caPem: string): Dispatcher` - `new Agent({ connect:
    { ca: [caPem], checkServerIdentity: () => undefined } })` from `undici`.
    `checkServerIdentity` must be overridden: devices are addressed by LAN IP
    and the pinned cert's SAN will not match; trust comes from the CA pin.
- `packages/cli/src/credentials.ts`: persist two new optional fields in
  `~/.devicesdk/credentials.json`: `serverCaPem: string` and
  `serverCaFingerprint: string`. Follow the existing read/write shape.
- `packages/cli/src/api/shared.ts`:
  - `normalizeHost`: default scheme becomes `https://` (keep accepting
    explicit `http://` untouched - that is the `TLS_ENABLED=false` path).
  - `request()`: build the fetch options once; when the resolved URL is
    `https:` and a stored `serverCaPem` exists, call undici's `fetch` with
    `dispatcher: makePinnedDispatcher(pem)`; otherwise keep the global fetch.
    When an https request fails with a TLS verification error (undici error
    `cause` codes `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN`,
    or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), rethrow as a friendly error:
    `"Server uses a self-signed certificate. Run 'devicesdk login --host <url>' to trust it."`
  - Update the two hard-coded hint strings that read
    `devicesdk login --host http://<server>:8080` to `https://`.
- `packages/cli/src/commands/login.ts`: before the device-code flow, when the
  target is `https:` and no pin is stored (or the stored pin fails), call
  `probeServerCertificate`, print
  `Server certificate fingerprint (SHA-256): <fp>` plus a one-line "verify
  this matches the fingerprint in your server logs" note, ask for
  confirmation (reuse whatever prompt utility login already uses; if none,
  `node:readline`), then persist the pin and proceed with the pinned
  dispatcher. Publicly-trusted certs (reverse-proxy deployments) never hit
  this path because plain verification succeeds.
- `packages/cli/src/commands/logs.ts`: when the stream URL is `wss:` and a
  pin is stored, pass `{ ca: [serverCaPem], checkServerIdentity: () => undefined }`
  in the existing `new WebSocket(url, {...})` options object.
- `packages/cli/src/api/mdnsDiscovery.ts`: find where the discovered host is
  turned into a URL (grep for `http://` in that file) and emit `https://`.

Tests (`packages/cli/src/api/tlsPin.test.ts`, vitest, model after
`packages/cli/src/api/mdnsDiscovery.test.ts` for structure):

- Start a `node:https` server with a fixture cert/key pair committed under
  `packages/cli/src/api/__fixtures__/test-cert.pem` + `test-key.pem`
  (generate them once with the Step 2 generator via a throwaway script, or
  `openssl req -x509 -newkey ec ...`; name them clearly and add a
  `__fixtures__/README.md` line stating they are test-only material, not
  secrets).
- `probeServerCertificate` returns the fixture cert's PEM and fingerprint.
- undici `fetch` through `makePinnedDispatcher(fixturePem)` against that
  server succeeds; the same fetch without the dispatcher rejects.
- `normalizeHost("192.168.1.10:8080")` now returns
  `https://192.168.1.10:8080` and `normalizeHost("http://x")` is unchanged.

**Verify**: `pnpm test --filter @devicesdk/cli` - all pass.
`pnpm build --filter @devicesdk/cli` exits 0.

### Step 9: Dashboard dev fallback

In `apps/dashboard/src/config/apiHost.ts` change the dev fallback from
`'http://localhost:8080'` to `'https://localhost:8080'` and extend the
comment: quasar-dev users must either visit `https://localhost:8080` once and
accept the self-signed certificate, or run the server with
`TLS_ENABLED=false` and set `VITE_API_HOST=http://localhost:8080`.

**Verify**: `pnpm check-types --filter @devicesdk/dashboard` exits 0.

### Step 10: ESP32 firmware - pinned TLS mode

- Create `firmware/esp32/main/pinned_ca.h` / `pinned_ca.c` with the
  `DEVICESDK_PINNED_CA[2049]` array exactly as specified in "The pinned-CA
  placeholder constant", including a comment block in the style of
  `config.h`'s placeholder warning (do not change length; server patches it).
- Register `pinned_ca.c` in `firmware/esp32/main/CMakeLists.txt` (add to the
  same source list that contains `devicesdk_main.c`).
- In `devicesdk_main.c` `websocket_task` (lines 470-520):

  ```c
  const bool ca_pinned = (DEVICESDK_PINNED_CA[0] == '-');
  const bool use_tls = ca_pinned || (strchr(api_host, ':') == NULL);
  ```

  Build the URI with `wss` whenever `use_tls`. In `websocket_cfg`:
  - `ca_pinned`: `.transport = WEBSOCKET_TRANSPORT_OVER_SSL`,
    `.cert_pem = DEVICESDK_PINNED_CA`, `.crt_bundle_attach = NULL`,
    `.skip_cert_common_name_check = true` (trust is the pinned cert itself;
    the host is a LAN IP that will never match the SAN).
  - not pinned: exactly today's two branches, untouched.
  - Update the lines 475-480 comment to describe the three modes (pinned TLS,
    public-CA TLS for bare hostnames, plain WS for host:port without pin).
- The patched region is used directly as a C string (PEM has no interior NULs
  and the patcher zero-pads), so do NOT route it through
  `sanitize_credential` - its 2 KB would also overflow the sanitize buffers'
  stack assumptions; just reference the array.
- Confirm the two config fields exist in the managed component before relying
  on them: `grep -rn "skip_cert_common_name_check\|cert_pem" firmware/esp32/node_modules/ managed_components/ 2>/dev/null`
  or check the pinned `espressif/esp_websocket_client` headers. If either
  field does not exist, STOP condition 5.

**Verify**: no local toolchain - verification is `pnpm lint` cleanliness of
non-C files plus CI: after the PR is opened, the `firmware-esp32` workflow
must build all targets green. State this explicitly in the PR body.

### Step 11: Pico firmware - pinned TLS mode

- Create `firmware/pico/src/pinned_ca.h` / `pinned_ca.c` (same array,
  same comment) and add `src/pinned_ca.c` to the executable's source list in
  `firmware/pico/CMakeLists.txt`.
- `firmware/pico/lib/lwip_ws/ws_client.h`: extend
  `connect(const char* host, const char* path, const char* token)` with a
  fourth parameter `const char* pinned_ca` (pass `nullptr` for none), and
  document the three modes in the `use_tls` comment (lines 29-31).
- `ws_client.cpp` `connect()` (lines 32-66): parse `host[:port]` as today,
  then:

  ```cpp
  const bool ca_pinned = (pinned_ca != nullptr && pinned_ca[0] == '-');
  if (ca_pinned) {
      this->use_tls = true;               // port stays as parsed (default 443)
  } else if (colon != std::string::npos) {
      this->use_tls = false;              // legacy plain WS
  } else {
      this->use_tls = true;               // legacy public-CA TLS on 443
  }
  ```

  Store the pinned pointer; in `on_dns_found` (line 135) create the TLS
  config from the pinned PEM when set:

  ```cpp
  const u8_t* ca = ca_pinned ? (const u8_t*)pinned_ca : ca_cert_pem;
  size_t ca_len = ca_pinned ? strlen(pinned_ca) + 1 : ca_cert_pem_len;
  tls_config = altcp_tls_create_config_client(ca, ca_len);
  ```

  (mbedTLS PEM parsing requires the length to include the NUL terminator;
  `ca_cert_pem_len` already does via `sizeof`.)
- `firmware/pico/main.cpp`: pass `DEVICESDK_PINNED_CA` at both `connect`
  call sites (lines 362 and 418), including the new header.
- **mbedTLS hostname investigation (do this before committing):** the client
  never calls `mbedtls_ssl_set_hostname`. Determine the mbedTLS version the
  pinned pico-sdk ships (check `pico_sdk_import.cmake` / the SDK version used
  in `.github/workflows/firmware-pico.yml`, then that SDK's `lib/mbedtls`
  submodule tag). mbedTLS >= 3.6.3 aborts client handshakes when no hostname
  was set unless the build defines
  `MBEDTLS_SSL_CLI_ALLOW_WEAK_CERTIFICATE_VERIFICATION_WITHOUT_HOSTNAME`.
  - If the shipped mbedTLS is older than 3.6.3: change nothing.
  - If 3.6.3 or newer: add that `#define` to `firmware/pico/mbedtls_config.h`
    with a comment explaining that trust is a pinned per-server certificate,
    so hostname matching adds nothing (the "weak" naming refers to public-PKI
    use, not pinning).
  - If the SDK's mbedTLS requires the hostname and the define does not exist
    in that version: STOP condition 6.

**Verify**: CI `firmware-pico` workflow builds green after the PR opens
(no local toolchain). Note it in the PR body next to the ESP32 note.

### Step 12: Docs

- `docs/public/guides/self-hosting.md`: new "TLS and certificates" section:
  TLS-on-by-default behavior; where the generated material lives
  (`DATA_DIR/tls/`); the `TLS_ENABLED`, `TLS_CERT_FILE`, `TLS_KEY_FILE` env
  vars; the browser interstitial and how to import the cert from
  `GET /v1/server/tls-cert`; the CLI fingerprint prompt on first login;
  reverse-proxy setups (terminate TLS at the proxy, run the server with
  `TLS_ENABLED=false` and `TRUST_PROXY=1`); and an explicit upgrade note:
  **previously flashed devices speak plain WS and must be reflashed after
  upgrading** (firmware downloads always rotate the device token anyway, per
  the existing download contract).
- `docs/public/guides/security.md`: update any claim that LAN traffic is
  unencrypted; describe the pinning model (server cert baked into firmware,
  hostname check intentionally skipped, trust anchored in the per-server
  certificate).
- `docs/public/quickstart.md` and `docs/public/first-device.md`: switch
  `http://` example URLs to `https://`
  (`grep -n "http://" docs/public/quickstart.md docs/public/first-device.md`
  to find them; leave URLs that point at third-party sites).

**Verify**: `grep -rn "http://<server>\|http://localhost:8080" docs/public/guides/self-hosting.md docs/public/quickstart.md` shows only
intentional `TLS_ENABLED=false` examples.

### Step 13: Changeset, lint, PR

Create `.changeset/tls-by-default.md`:

```markdown
---
"@devicesdk/server": minor
"@devicesdk/cli": minor
"@devicesdk/firmware-esp32": minor
"@devicesdk/firmware-pico": minor
"@devicesdk/dashboard": patch
"@devicesdk/website": patch
---

BREAKING: the server now serves TLS only by default (`TLS_ENABLED=true`). A
persistent self-signed certificate is generated under `DATA_DIR/tls/` on
first boot and pinned into every firmware download; devices connect over WSS
and verify the pinned certificate. Set `TLS_ENABLED=false` to restore
plain-HTTP serving. Previously flashed devices must be reflashed. The CLI
now defaults to https:// hosts and pins the server certificate on first
login (trust-on-first-use).
```

The firmware changesets are mandatory (repo rule: no changeset = firmware
never ships). Keep every bump at `minor`; do NOT use `major` (repo rule:
never without explicit owner consent - the owner approved the behavior
break, not a major bump; the BREAKING prefix in the changelog text carries
the message).

Run the full gate: `pnpm lint`, `pnpm check-types --filter @devicesdk/server`,
`pnpm test --filter @devicesdk/server`, `pnpm test --filter @devicesdk/cli`,
`pnpm check-types --filter @devicesdk/dashboard`. Commit, then follow the Git
workflow section for the PR (include the CI-firmware and hardware-validation
notes in the PR body).

## Test plan

- `apps/server/tests/unit/tls-cert.test.ts` (new): X509 parse assertions,
  strict pinned `node:tls` handshake against `Bun.serve`, key-uniqueness,
  cert-store persistence + key file mode.
- `apps/server/tests/e2e/tls.test.ts` (new): HTTPS health, pinned raw-socket
  WSS 101 upgrade with Bearer auth, `/v1/server/tls-cert` round-trip.
- `apps/server/tests/e2e/firmware.test.ts` (extended): CA region patched with
  PEM / zeroed / 409-on-missing-placeholder / checksum still valid.
- `packages/cli/src/api/tlsPin.test.ts` (new): probe, pinned dispatcher
  accept/reject, `normalizeHost` https default.
- Firmware: CI builds only; hardware validation (one ESP32 family member +
  one Pico W connecting over WSS to a default-mode server, plus one
  `TLS_ENABLED=false` regression flash) is an owner step before merge.

## Done criteria

Machine-checkable; ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm check-types --filter @devicesdk/server` and `--filter @devicesdk/dashboard` exit 0
- [ ] `pnpm test --filter @devicesdk/server` exits 0, including new files `tests/unit/tls-cert.test.ts` and `tests/e2e/tls.test.ts`
- [ ] `pnpm test --filter @devicesdk/cli` exits 0, including `src/api/tlsPin.test.ts`
- [ ] Step 4 smoke checks: default mode serves `https://localhost:8080/health` and refuses plain HTTP; `TLS_ENABLED=false` serves plain HTTP
- [ ] `grep -c "0d884b5ff49a5520cd00307566ab6d39" apps/server/src/endpoints/devices/downloadFirmware.ts apps/server/tests/e2e/firmware.test.ts firmware/esp32/main/pinned_ca.c firmware/pico/src/pinned_ca.c` reports exactly 1 per file (constant present in all four places)
- [ ] `.changeset/tls-by-default.md` exists and names all six packages listed above
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated
- [ ] PR body states that firmware verification is CI + owner hardware validation

## STOP conditions

Stop and report back (do not improvise) if:

1. Code at any "Current state" location does not match its excerpt (drift
   since `bbd724d`), or plans 006/007 landed first and already restructured
   the firmware connection paths.
2. `Bun.serve` with `tls` fails to complete WebSocket upgrades through the
   shared `websocket` handler (Step 7 assertion 3 fails twice) - the
   single-listener design assumption would be wrong.
3. WebCrypto in the pinned Bun version cannot export PKCS#8 for P-256 keys,
   or `node:tls.connect` refuses the generated certificate in Step 2's
   handshake test after one debugging pass.
4. The CLI cannot pass a `dispatcher` through its request path without
   rewriting `request()` beyond recognition, or `undici`'s types conflict
   with the CLI's strict TS config in a way a type-only import does not fix.
5. `esp_websocket_client_config_t` in the pinned component lacks `cert_pem`
   or `skip_cert_common_name_check`.
6. The pico-sdk's mbedTLS requires `mbedtls_ssl_set_hostname` (3.6.3+) and
   does not offer
   `MBEDTLS_SSL_CLI_ALLOW_WEAK_CERTIFICATE_VERIFICATION_WITHOUT_HOSTNAME`.
7. CI secret scanning rejects the committed CLI test fixture key even after
   naming/README clarification - do not add scanner exceptions on your own.
8. A required firmware CI workflow fails to build the new sources after two
   fix attempts.

## Maintenance notes

- **Anything that changes the placeholder constant must change all four
  copies**; the done-criteria grep is the guard. Never change its length.
- Plan 007 (MQTT transport) adds a second device transport; its broker
  listener must eventually gain the same TLS material (out of scope here;
  note it in 007's review).
- The generated certificate never expires by design (device clocks are
  unsynced). If SNTP is ever added to the firmwares, consider issuing
  normal-validity certs plus rotation; that also requires a re-pinning story
  (reflash or a cert-rotation endpoint).
- `MDNS_HOSTNAME` changes after first boot leave a stale SAN in the generated
  cert. Harmless for devices (hostname check skipped) and for the pinned CLI;
  only browser-trust-store users notice. A future `devicesdk` server command
  could regenerate the cert; deferred.
- Reviewers should scrutinize: the DER writer (compare against an
  `openssl x509 -text` dump of a generated cert), the `checkServerIdentity`
  overrides (must exist ONLY on pinned paths, never on public-CA paths), and
  that `downloadFirmware` still recalculates the ESP32 checksum after the CA
  patch.
- Deferred follow-ups: dashboard UI page showing the cert fingerprint;
  `devicesdk login` flag to pre-seed a pin non-interactively (CI use);
  ESP32-side heap watermark measurement for TLS on the C3.

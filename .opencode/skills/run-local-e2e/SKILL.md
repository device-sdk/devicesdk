---
name: run-local-e2e
description: Use when running the full DeviceSDK stack end-to-end on a developer laptop — local API + dashboard + CLI + flashing a real ESP32 device on the LAN that connects to the local API. Covers prereq discovery, OAuth bypass paths, firewall, and the ws/wss heuristic needed for plain-HTTP local dev.
---

# Run Local E2E

> **Migration note:** This skill was ported from the Cloudflare-era workflow.
> Verify current server commands, ports, and auth paths against `AGENTS.md` and
> `apps/server/src/config.ts` before running. In particular, the self-hosted
> server now runs on port `8080` and uses local authentication by default.

A complete recipe for: laptop running the API + dashboard locally, ESP32 on the
same WiFi network connected to the local API, with a deployed user script. The
path that bypasses the binary-patching brittleness called out in `AGENTS.md`.

## When to use this

The user wants to:
- Test a code change end-to-end with a real device pointing at their laptop
- Reproduce a bug a deployed device exhibits
- Hand a developer the exact steps they need to onboard their first device

If the user only needs the API + dashboard tested without a real device, `pnpm
test:e2e --filter @devicesdk/dashboard` (Playwright) is faster and doesn't
require any of this.

## Step 0 — Discovery (always run in parallel)

```bash
ip -4 -o addr show | awk '{print $2, $4}'              # find LAN IP
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null               # find ESP device port
ls ~/esp/esp-idf/export.sh 2>/dev/null                 # confirm ESP-IDF
iw dev wlan0 link 2>&1 | head -3                       # current WiFi SSID + BSSID
grep -E '^(ENV|GOOGLE_)' apps/server/.dev.vars         # confirm local dev vars if they exist
systemctl is-active firewalld ufw 2>&1                 # detect host firewall
```

What you need before continuing:
- LAN IP on `wlan0` (e.g. `192.168.1.238/24`) — this is the host the firmware will dial
- ESP device on `/dev/ttyACM0` (Espressif native USB JTAG/serial enumerates as ACM, not USB)
- `~/esp/esp-idf/export.sh` exists (ESP-IDF v5.5+)
- The local server environment has the credentials/config it needs (see `apps/server/src/config.ts`)
- `systemctl is-active firewalld ufw` tells you whether the host firewall will block the device

## Step 1 — Servers

```bash
pnpm dev --filter @devicesdk/server        # binds 0.0.0.0:8080 (Bun server)
pnpm dev --filter @devicesdk/dashboard     # binds 0.0.0.0:9000 (Quasar dev server)
```

Wait for both to return HTTP 200:

```bash
until curl -sf -o /dev/null http://localhost:8080/; do sleep 1; done
until curl -sf -o /dev/null http://localhost:9000/; do sleep 1; done
```

## Step 2 — Host firewall

If `ufw` is active, the device's TCP SYN on `:8080` will silently die — the
symptom is `esp-tls: select() timeout` on serial even though plain `ws://` is
in use. (The `esp-tls` label is misleading; that layer abstracts TCP too.)

```bash
sudo ufw status numbered                              # see existing rules
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp comment "local devicesdk dev"
```

Use the LAN's actual `/24` (from Step 0). Per-device (`from 192.168.1.242`) is
more targeted; per-LAN is more flexible across reflashes. **Never** suggest
`sudo ufw disable` as the default — it's a kill-switch, not a fix.

## Step 3 — CLI login (interactive)

```bash
DEVICESDK_API_URL=http://localhost:8080 npx devicesdk login --host http://localhost:8080
```

The CLI uses the device-authorization flow (`packages/cli/src/commands/login.ts`):
1. Prints `http://localhost:8080/cli/auth?code=XXXX-NNNN` and tries to `xdg-open` it
2. User approves the request in the browser, the API sets a session cookie on `localhost`, the approval page renders, user clicks Approve
3. CLI polls `/v1/cli/auth/poll` until it gets `access_token` (`dsdk_<hex>`) + `refresh_token`
4. Credentials are written to `~/.devicesdk/credentials.json` mode `0600`

**The user must click through the browser** — there is no headless OAuth path.
If you're running this autonomously and need a token without browser
interaction, see Step 3a.

### Step 3a — Token bypass (no browser)

Two CLI auth paths and they target different tables — keep them straight:

| Token shape | Auth table | Where it's used |
|---|---|---|
| `dsdk_<hex>` | `cli_tokens` | What `devicesdk login` creates and `~/.devicesdk/credentials.json` stores |
| `<32-hex>` (no prefix) | `tokens` | API tokens minted via `POST /v1/tokens`, used by **firmware Bearer** |

Both authenticate at the API edge — the middleware in
`apps/server/src/foundation/auth.ts` branches on the `dsdk_` prefix.

The CLI honors `DEVICESDK_TOKEN` in the env (`packages/cli/src/credentials.ts`)
**before** reading the credentials file. So a `tokens`-table row works for both
`devicesdk` commands and the firmware:

```bash
# Seed a user + token directly in the local SQLite database (only when browser flow is unavailable)
TOKEN=$(openssl rand -hex 16)
TOKEN_HASH=$(node -e "
  const t=process.argv[1];
  const h=require('crypto').createHash('sha256').update(t).digest('hex');
  console.log(h);
" "$TOKEN")
USER_ID=$(uuidgen)
TOKEN_ID=$(uuidgen)
NOW=$(date +%s%3N)
cd apps/server
# Use the D1-compat facade or sqlite3 directly against data/devicesdk.sqlite
sqlite3 data/devicesdk.sqlite "INSERT INTO user (id,email,verified_email,created_at,plan,onboarding_completed) VALUES ('$USER_ID','dev@local',1,$NOW,'free',1)"
sqlite3 data/devicesdk.sqlite "INSERT INTO tokens (id,user_id,token,token_hash,last_four,created_at) VALUES ('$TOKEN_ID','$USER_ID','','$TOKEN_HASH','${TOKEN: -4}',$NOW)"
echo "DEVICESDK_TOKEN=$TOKEN"
```

Then `export DEVICESDK_TOKEN=...` and run `devicesdk` commands — also use the
same value for `DEVICESDK_API_TOKEN` in firmware `config.h`.

## Step 4 — Mint API token for firmware

If you used the browser flow, your CLI access token is `dsdk_…` and won't work
as a firmware Bearer (it's for `cli_tokens`, but firmware traffic hits the same
authenticator that accepts both — actually it does work, but it expires per
`cli_tokens.expires_at`, so **mint a long-lived API token instead**):

```bash
ACCESS=$(node -e "console.log(JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.devicesdk/credentials.json','utf8')).accessToken)")
curl -sS -X POST http://localhost:8080/v1/tokens \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"description":"esp32 local dev"}' | tee /tmp/api-token.json
# response.result.token is the 32-hex API token — save it for config.h
```

## Step 5 — Deploy a user script

```bash
pnpm local:deploy   # = DEVICESDK_API_URL=http://localhost:8080 pnpm --filter @devicesdk/example-basic run deploy
```

`devicesdk deploy` auto-creates the project + device on first run
(`packages/cli/src/commands/deploy.ts`). Project and device IDs are **slugs**
(e.g. `dummy`, `device`), not UUIDs — they come from `examples/basic/devicesdk.ts`.

Match the example's `deviceType` to the actual board (`esp32c3`, `esp32c61`,
`pico2-w`). Valid values are in `packages/cli/src/config.ts`. The deviceType is
metadata used for type generation in `generateDeviceTypes` — runtime auth
doesn't depend on it, but mismatches mislead future readers.

## Step 6 — Firmware build (build from source — never patch binaries for ESP32)

Per `AGENTS.md` and `apps/server/src/foundation/esp32ImageChecksum.ts`, the
API's binary-patching path produces unbootable images on some boards. Always
build from source for local dev.

### 6a. Edit `firmware/esp32/main/config.h`

```c
#define DEVICESDK_WIFI_SSID     "Nau"               // 2.4GHz SSID — ESP32-C3 has no 5GHz radio
#define DEVICESDK_WIFI_PASSWORD "<wifi-password>"
#define DEVICESDK_API_TOKEN     "<32-hex from step 4>"
#define DEVICESDK_API_HOST      "192.168.1.238:8080"  // <lan-ip>:<port>
#define DEVICESDK_PROJECT_ID "dummy"             // SLUG, matches devicesdk.ts
#define DEVICESDK_DEVICE_ID  "device"            // SLUG, matches devicesdk.ts
```

These are placeholders in git — **always `git restore firmware/esp32/main/config.h` after the flash succeeds** (`AGENTS.md`).

### 6b. ws/wss heuristic — required for local dev

`firmware/esp32/main/devicesdk_main.c` builds the WS URI. Production hostnames have
no port and use `wss://`; local dev has `host:port` and needs `ws://`. The fix
at `devicesdk_main.c`:

```c
const bool use_tls = (strchr(api_host, ':') == NULL);
snprintf(uri, sizeof(uri), "%s://%s%s", use_tls ? "wss" : "ws", api_host, ws_path);
// ...
.transport = use_tls ? WEBSOCKET_TRANSPORT_OVER_SSL : WEBSOCKET_TRANSPORT_OVER_TCP,
.crt_bundle_attach = use_tls ? esp_crt_bundle_attach : NULL,
```

If this isn't in the tree, every local-dev flash fails at the TCP-handshake
stage with `ESP_ERR_ESP_TLS_FAILED_CONNECT_TO_HOST` — even though the "TLS"
label suggests a cert problem, the TLS layer is just the unified transport
abstraction. Confirm by `grep -n 'use_tls' firmware/esp32/main/devicesdk_main.c`
before building. If absent, restore from PR history or apply the diff above
(and add `#include <stdbool.h>` to the file's includes).

### 6c. Build

```bash
cd firmware/esp32
source ~/esp/esp-idf/export.sh
idf.py set-target esp32c3   # only if changing target — slow rebuild
idf.py build
```

#### Stale-build trap

If a prior build was run inside Docker (CI / devcontainer),
`firmware/esp32/build/` may contain root-owned files. CMake then fails with
permission-denied messages disguised as "C compiler is broken". Fix without
sudo:

```bash
mv build build.stale-docker        # parent dir is yours; rename works even though contents are root
idf.py build                        # rebuilds fresh
```

A fresh ESP-IDF build is 2–4 minutes; incremental rebuilds (no `set-target`)
are 10–30 s.

## Step 7 — Flash

```bash
python -m esptool --chip esp32c3 --port /dev/ttyACM0 -b 460800 \
  --before default_reset --after hard_reset \
  write_flash --flash_mode dio --flash_size 2MB --flash_freq 80m \
  0x0     build/bootloader/bootloader.bin \
  0x8000  build/partition_table/partition-table.bin \
  0x10000 build/devicesdk-client.bin
```

ESP32-C3 and C61 both use bootloader offset `0x0` (per `AGENTS.md` C3/C61
specifics). Old ESP32s use `0x1000` — don't apply this layout there.

After flash succeeds: **`git restore firmware/esp32/main/config.h`**
immediately. The placeholders must go back into git before any commit.

## Step 8 — Verify

Three signals, in order of cost:

1. **API log** — incoming connection from device IP, with WS upgrade:
   ```bash
   # Look at the running Bun server output for the device IP and WebSocket upgrade line
   # expect: GET /v1/projects/<slug>/devices/<slug>/connect/websocket 101 Switching Protocols
   ```

2. **API status endpoint** — confirms the server has the device active:
   ```bash
   curl -sS -H "Authorization: Bearer $ACCESS" \
     http://localhost:8080/v1/projects/dummy/devices/device/status
   # expect: {"connected":true,"connected_since":...,"current_version_id":"<bundle-id>"}
   ```

3. **Serial** — `timeout 12 cat /dev/ttyACM0` after `stty -F /dev/ttyACM0 raw -echo`. Reset via DTR/RTS toggle in pyserial if needed:
   ```python
   import serial, time
   s = serial.Serial('/dev/ttyACM0', 115200)
   s.setDTR(False); s.setRTS(True); time.sleep(0.2); s.setRTS(False); s.close()
   ```
   Look for `connected with <SSID>`, `got ip:<x.y.z.w>`, then no errors. Healthy device is *quiet* on serial — script logs only if it calls `console.log`.

## Common failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| Login times out, no approval page | CLI auth not configured or wrong API URL | Check `DEVICESDK_API_URL`, server logs, and `apps/server/src/config.ts` |
| `esp-tls: select() timeout` on serial despite WS-not-WSS | host firewall blocks `:8080` | `sudo ufw allow from <lan>/24 to any port 8080 proto tcp` |
| `connect() error: Host is unreachable` early after boot | Wifi not yet connected (normal during boot) — only worry if it persists past `got ip:` | Wait one reconnect cycle (10 s) |
| `ESP_ERR_ESP_TLS_FAILED_CONNECT_TO_HOST` after WiFi up | Firmware compiled before the ws/wss heuristic; binary still uses `wss://` against a port-bearing host | Verify the heuristic is in `devicesdk_main.c`, rebuild, reflash |
| CMake "C compiler is broken" | Stale Docker artifacts under `firmware/esp32/build/` owned by root | `mv build build.stale-docker && idf.py build` |
| `404 Not Found` on `GET /v1/projects/<slug>` after deploy | Trying to query before `pnpm local:deploy` ran or auto-create failed | Look for `Created project "<slug>"` in deploy output; otherwise CLI access token may be expired |
| Device IP and laptop IP on different `/24` | Router has separate subnets for 2.4G/5G SSIDs | Connect laptop to the same SSID as the device, or have user reconfigure router |
| Serial cat returns nothing | Port held by another reader (e.g. previous `idf.py monitor`); also: ESP32-C3 native CDC stops emitting if no consumer | `lsof /dev/ttyACM0` to find competing reader; reset via DTR/RTS toggle |

## End-of-task hygiene

Before reporting "done":

1. `git status` — should show **only** intentional changes. Specifically,
   `firmware/esp32/main/config.h` must be back to placeholders.
2. Stop background dev servers. Leaving them running is annoying but not
   harmful.
3. Decide which of the helper edits should persist:
   - **Keep**: `firmware/esp32/main/devicesdk_main.c` ws/wss heuristic (makes local dev work without binary patching).
   - **Decide per task**: `examples/basic/devicesdk.ts` `deviceType` — only change if the example's target board actually changed.
4. The ufw rule from Step 2 is narrow (LAN-only, single port) and persists.
   Document it if onboarding others.

## Source-of-truth pointers

| Concern | Path |
|---|---|
| Auth middleware (token table branching) | `apps/server/src/foundation/auth.ts` |
| CLI credential storage | `packages/cli/src/credentials.ts` (file: `~/.devicesdk/credentials.json`, env: `DEVICESDK_TOKEN`) |
| API token mint | `apps/server/src/endpoints/tokens/createApiToken.ts` |
| Deploy auto-create-project | `packages/cli/src/commands/deploy.ts` |
| Firmware WS URI build | `firmware/esp32/main/devicesdk_main.c` |
| Firmware credential placeholders | `firmware/esp32/main/config.h` |
| Server bind address | `apps/server/src/config.ts` |
| Local convenience scripts | root `package.json`: `local`, `local:login`, `local:deploy`, `local:flash` |

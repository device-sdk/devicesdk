# Plan 001: Home Assistant HACS custom integration (full v1, phased)

> **Executor instructions**: Follow this plan phase by phase, step by step. Run
> every verification command and confirm the expected result before moving on.
> If anything in the "STOP conditions" section occurs, stop and report - do not
> improvise (especially: do not invent server API endpoints, command types, or
> JSON shapes that are not listed in the "Server API contract" section below).
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: this plan builds a NEW package and depends on the
> already-shipped DeviceSDK server API staying as documented. Verify the API
> contract has not changed since this plan was written:
>
> ```bash
> git diff --stat c64cc11..HEAD -- \
>   apps/server/src/foundation/auth.ts \
>   apps/server/src/endpoints/projects/listProjects.ts \
>   apps/server/src/endpoints/devices/listDevices.ts \
>   apps/server/src/endpoints/devices/getDeviceEntities.ts \
>   apps/server/src/endpoints/devices/getDeviceStatus.ts \
>   apps/server/src/endpoints/devices/sendCommand.ts \
>   apps/server/src/endpoints/devices/wsRoutes.ts \
>   apps/server/src/runtime/logStore.ts \
>   apps/server/src/runtime/deviceSender.ts \
>   packages/core/src/ha.ts
> ```
>
> If any of those files changed, re-read them and compare against the "Server
> API contract" section before proceeding. On a meaningful mismatch (a path,
> field name, frame shape, or command payload differs), treat it as a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (greenfield, isolated package - low blast radius on the existing
  repo; risk is in HA-version/test-harness churn and the WS reconnection logic)
- **Depends on**: none
- **Category**: direction (flagship roadmap feature)
- **Planned at**: commit `c64cc11`, 2026-06-29
- **Issue**: (none - not published via `--issues`)

## Why this matters

The Home Assistant integration is the **flagship roadmap item** (`ROADMAP.md`
lines 11-26). The entire server side already ships: per-device Home Assistant
entity declarations are persisted (`device_entity_configs` table, `GET/PUT
.../entities`), the watch WebSocket streams structured `state` and `status`
frames, and `POST .../command` drives hardware. There is even a published
product/spec doc at `docs/public/guides/home-assistant.md` describing the
intended user experience. The **only** missing piece is the Home Assistant
component itself - a Python HACS custom integration that points at a self-hosted
DeviceSDK server, discovers devices, creates HA entities, subscribes to the
watch WebSocket for live state, and sends commands for controllable entities.

When this lands, a user who runs `devicesdk deploy` with `ha.entities` in their
`devicesdk.ts` gets native Home Assistant entities (sensors, binary sensors,
switches, lights) that work in automations, dashboards, and voice assistants -
the value proposition the docs already promise.

## Current state

The integration does **not** exist yet. `find . -name manifest.json` for a HA
component returns nothing; there is no `integrations/` directory; no Python in
the product source tree.

Everything the integration consumes is already built and stable. The
authoritative product spec is `docs/public/guides/home-assistant.md` (read it -
it defines the UX, the entity-type mapping table, and the troubleshooting
behavior). The canonical entity-declaration type is `HaEntityDeclaration` in
`packages/core/src/ha.ts`.

### Server API contract (verified at `c64cc11` - this is your source of truth)

The integration talks to the DeviceSDK server over plain HTTP/WS on the LAN.

**Base & auth**

- Base URL: `{host}` is what the user enters, e.g. `http://devicesdk.local:8080`
  or `http://192.168.1.50:8080`. All REST paths below are appended to `{host}`.
- Auth header on **every** request **including the WebSocket handshake**:
  `Authorization: Bearer {token}`. The token is an API token created in the
  dashboard (Account → API Tokens). It is a 32-character hex string with **no
  prefix**. (CLI `dsdk_*` tokens also work but the integration asks for an API
  token.)
  - **Critical**: the server reads the token ONLY from the `Authorization`
    header or a session cookie - there is **no query-parameter token fallback**
    (`apps/server/src/foundation/auth.ts` `getToken`). `aiohttp`'s WS client
    can set request headers on the handshake, so this works. Do not attempt to
    pass the token as a `?token=` query param - it will 401.
- Response envelope (all REST endpoints): success is
  `{"success": true, "result": <payload>}`; failure is
  `{"success": false, "error": "<message>"}`. Always branch on `success`.
- **Path identifiers are slugs, not UUIDs.** `{project}` in a path is the
  project's `project_slug`; `{device}` is the device's `device_id` (slug). The
  list endpoints return both a UUID (`id`) and the slug - **use the slug** in
  subsequent URLs. (Confirmed: `resolveProjectAndDevice` and every device
  endpoint look up by `project_slug` / `device_slug`.)

**REST endpoints**

| Purpose | Method & path | Success `result` shape |
|---|---|---|
| List projects | `GET /v1/projects?page=1&per_page=100` | `{ items: [{ id, project_slug, created_at }], page, per_page, has_more }` |
| List devices | `GET /v1/projects/{project}/devices?page=1&per_page=100` | `{ items: [{ id, device_id, name, description, current_version_id, last_connected_at, created_at, updated_at }], page, per_page, has_more }` |
| Get entity declarations | `GET /v1/projects/{project}/devices/{device}/entities` | `{ entities: [HaEntityDeclaration, ...] }` |
| Get live status | `GET /v1/projects/{project}/devices/{device}/status` | `{ connected: bool, connected_since: number\|null, last_connected_at: number\|null, current_version_id: string\|null }` |
| Send command | `POST /v1/projects/{project}/devices/{device}/command` body `{ "type": <cmd>, "payload": {...} }` | `{ id, type, payload }` (200). **503** if device offline, **504** if it did not respond in time, **404** unknown project/device. |

Pagination: `has_more` is true when more pages exist; follow with `page+1`. For
a home install you can request `per_page=100` and loop until `has_more` is false.

**Watch WebSocket** (the live-state source)

- URL: same path family, but WS scheme:
  `{ws_host}/v1/projects/{project}/devices/{device}/watch`
  where `ws_host` = `{host}` with `http://`→`ws://` and `https://`→`wss://`.
- Send header `Authorization: Bearer {token}` on the handshake (see above).
- Optional query `?backfillLimit=0` to skip historical log replay (the
  integration only cares about live frames, so request `backfillLimit=0`).
- Each message is a JSON text frame: `{ "event": <type>, "data": <obj>, "replay"?: bool }`.
  Event types and their `data`:
  - `"status"` → `{ "connected": bool, "connectedSince": number|null }`
    (note camelCase `connectedSince` here, unlike the REST `connected_since`).
    Emitted on connect/disconnect. Use it to drive entity availability and the
    connectivity binary_sensor.
  - `"state"` → `{ "entity_id": string, "value": any, "source": string }`.
    This is the live entity update. See the mapping rules below.
  - `"log"` → `{ id, level, message, created_at }`. **Ignore** for entities.
  - `"history_complete"` → no `data`. Marks end of backfill; ignore.

**`HaEntityDeclaration` fields** (`packages/core/src/ha.ts`):

```
entity_id      string   stable id, /^[a-z][a-z0-9_]*$/, unique within the device
type           "binary_sensor" | "sensor" | "switch" | "light" | "number"
name           string   human-readable HA name
device_class?  string   e.g. "door", "temperature", "humidity"
unit?          string   e.g. "°C", "%", "lux"
source         "gpio_state_changed" | "pin_state_update" | "temperature_result" | "user"
pin?           number   GPIO pin (for gpio/pwm/switch/ws2812-backed entities)
state_map?     { high: string, low: string }   for gpio binary_sensors: maps digital level → HA state string
light_type?    "pwm" | "ws2812"
pwm_frequency? number   for pwm lights
num_leds?      number   for ws2812 lights
```

### State-frame → declaration mapping (load-bearing - get this exactly right)

The watch WS emits `state` frames whose `entity_id` is **not** the declaration's
`entity_id` for hardware-backed sources. The runtime derives the frame
`entity_id` from the hardware source (see
`apps/server/src/runtime/logStore.ts` `broadcastStateFromMessage` and
`apps/server/src/runtime/deviceSession.ts` `emitState`). For each declaration,
compute the **stream key** = the `entity_id` you should match incoming frames
against:

| declaration `source` | stream key (frame `entity_id` to match) | frame `value` |
|---|---|---|
| `gpio_state_changed` | `f"gpio_pin_{pin}"` | `"high"` or `"low"` |
| `pin_state_update` | `f"gpio_pin_{pin}_analog"` | number or string |
| `temperature_result` | `"temperature"` | number (°C) |
| `user` | the declaration's literal `entity_id` | any JSON value |

So a binary_sensor declared as
`{ entity_id: "door_open", source: "gpio_state_changed", pin: 15 }` is fed by
frames with `entity_id == "gpio_pin_15"`. A sensor declared as
`{ entity_id: "soil_moisture", source: "user" }` is fed by frames with
`entity_id == "soil_moisture"` (the user's script calls
`DEVICE.emitState("soil_moisture", value)`).

Maintain, per device, a `dict[str, Any]` mapping stream-key → latest value, and
have each entity read its value by its own stream key.

### Command mapping for controllable entities (verified wire shapes)

From `apps/server/src/runtime/deviceSender.ts` and the `VALID_COMMAND_TYPES`
allow-list in `apps/server/src/endpoints/devices/sendCommand.ts`:

- **switch** (declaration `type: "switch"`, requires `pin`):
  - turn on → `POST .../command` `{ "type": "set_gpio_state", "payload": { "pin": <pin>, "state": "high" } }`
  - turn off → `{ "type": "set_gpio_state", "payload": { "pin": <pin>, "state": "low" } }`
- **light, PWM** (`type: "light"`, `light_type: "pwm"`, requires `pin` + `pwm_frequency`):
  - HA brightness is 0-255. duty cycle is a float **0..1** and the wire key is
    `duty_cycle` (snake_case, NOT `dutyCycle`).
  - turn on at brightness B → `{ "type": "set_pwm_state", "payload": { "pin": <pin>, "frequency": <pwm_frequency>, "duty_cycle": B/255 } }`
  - turn off → same with `"duty_cycle": 0`
  - Color mode: `ColorMode.BRIGHTNESS`.
- **light, WS2812** (`type: "light"`, `light_type: "ws2812"`, requires
  `num_leds` AND `pin`):
  - On first command in a session, send once:
    `{ "type": "pio_ws2812_configure", "payload": { "pin": <pin>, "num_leds": <num_leds> } }`
  - Then set color: `{ "type": "pio_ws2812_update", "payload": { "pixels": [[r,g,b], ... x num_leds] } }`
    where each channel is 0-255, scaled by HA brightness (rgb * brightness/255).
  - turn off → `pio_ws2812_update` with all `[0,0,0]`.
  - Color mode: `ColorMode.RGB`.
  - **The published docs example for a ws2812 light omits `pin`.** The schema
    allows `pin` (it is a top-level optional field). This integration
    **requires** `pin` on ws2812 light declarations. If a ws2812 light
    declaration has no `pin`, create the entity but log a warning and make it
    unavailable-for-control rather than guessing a pin. (See STOP conditions.)

Commands are best-effort hardware writes. The REST endpoint waits for a device
ack and returns 200 with the device's response, or 503/504 if the device is
offline / unresponsive. Treat 503/504 as "command failed" - raise
`HomeAssistantError` so the user sees it, and do **not** optimistically flip
state on failure.

### Conventions to honor

- This is a **standard Home Assistant custom integration** following the
  modern HA patterns: `DataUpdateCoordinator`, `ConfigFlow`, `CoordinatorEntity`,
  config-entry-based setup, `async_forward_entry_setups`. Match the structure of
  any current HACS integration (e.g. the structure documented at
  <https://developers.home-assistant.io/docs/creating_component_index>).
- Domain string: **`devicesdk`**. Title: **"DeviceSDK"**.
- Strict, typed Python; `async`/`await` throughout (HA is asyncio). Use HA's
  shared aiohttp session via `homeassistant.helpers.aiohttp_client.async_get_clientsession`.
- License: the repo is **AGPL-3.0-only** (`LICENSE`). New Python files get no
  per-file header (match the repo - existing source files carry no license
  header), but the integration `README.md` must state AGPL-3.0.
- Never commit secrets. The API token is user-entered config; it lives in the HA
  config entry, never in the repo or tests (tests use a dummy value like
  `"test-token"`).

## Commands you will need

This package is **Python**, independent of pnpm/Turbo. Work from
`integrations/home-assistant/`.

| Purpose | Command | Expected on success |
|---|---|---|
| Create venv | `python3.13 -m venv .venv && . .venv/bin/activate` | venv active |
| Install test deps | `pip install -r requirements_test.txt` | exit 0 |
| Byte-compile (syntax gate) | `python -m compileall custom_components` | exit 0, no `SyntaxError` |
| Lint (if ruff installed) | `ruff check custom_components` | exit 0 |
| Run tests | `pytest -q` | all pass |
| HA manifest validation | run in CI via `home-assistant/actions/hassfest` | hassfest passes |
| HACS validation | run in CI via `hacs/action` (`category: integration`) | passes |

> Python version: Home Assistant requires Python **3.13** at the time of
> writing. If `python3.13` is unavailable in the executor environment, STOP and
> report (do not silently fall back to 3.11/3.12 - the test harness may not
> install).

## Suggested executor toolkit

- Reference: Home Assistant developer docs - "Building a Python integration"
  and "Config Flow" (<https://developers.home-assistant.io/>). Read the
  "Integration manifest", "Config flow", and "Entity" pages before Phase 2.
- The test harness is `pytest-homeassistant-custom-component`
  (<https://github.com/MatthewFlamm/pytest-homeassistant-custom-component>) -
  its README shows the canonical `tests/conftest.py` and a config-flow test you
  can model on.

## Scope

**In scope** (create unless noted):

```
integrations/home-assistant/
  custom_components/devicesdk/
    __init__.py
    manifest.json
    const.py
    api.py                 # REST + WS client
    coordinator.py         # DataUpdateCoordinator + per-device WS tasks + state map
    config_flow.py
    entity.py              # shared CoordinatorEntity base + DeviceInfo
    binary_sensor.py
    sensor.py
    switch.py
    light.py
    strings.json
    translations/en.json
    diagnostics.py         # optional but cheap; redacts the token
  tests/
    __init__.py
    conftest.py
    const.py
    test_config_flow.py
    test_init.py
    test_coordinator.py
  hacs.json
  README.md
  requirements_test.txt
  .gitignore               # ignore .venv/, __pycache__/, .pytest_cache/
.github/workflows/home-assistant-integration.yml   # new CI workflow
.changeset/<random>.md     # @devicesdk/website patch (docs guide edit)
```

Plus an edit to `docs/public/guides/home-assistant.md` (Phase 7).

**Out of scope** (do NOT touch):

- Anything under `apps/`, `packages/`, `firmware/` - the server API is already
  shipped and correct. If you believe a server change is required, STOP and
  report (it means an assumption here is wrong).
- `pnpm-workspace.yaml`, `turbo.json`, root `package.json` - the Python package
  is **not** a JS workspace member. Do not add it to the workspace or Turbo.
- The HACS **distribution mirror repo** - publishing to HACS end-users is a
  separate follow-up (see Maintenance notes). Do not try to create another repo.
- The **`number`** entity platform - deferred (see "Deferred / out of scope").

## Git workflow

- Create your own worktree and branch (per repo policy - the repo forbids
  working in the main checkout):
  ```bash
  git worktree add .worktrees/ha-hacs-integration -b ha-hacs-integration
  ```
  Work only inside that worktree.
- Commit per phase; conventional-commit style (the repo uses it - see
  `git log --oneline`), e.g. `feat(homeassistant): scaffold HACS integration`.
  Scope token suggestion: `homeassistant`.
- Do NOT push or open a PR unless the operator asks. (When you do, note: the
  `origin` is `github.com/device-sdk/devicesdk-monorepo`; PRs target `main`.)

## Phases & steps

Build in this order so the package is importable and testable as early as
possible. After each phase, run the phase's verification before continuing.

---

### Phase 0 - Scaffold & metadata

**Step 0.1**: Create the directory tree under `integrations/home-assistant/` per
the Scope list (empty files are fine for now except the metadata files below).
Add `integrations/home-assistant/.gitignore` ignoring `.venv/`, `__pycache__/`,
`*.pyc`, `.pytest_cache/`.

**Step 0.2**: Write `custom_components/devicesdk/manifest.json`:

```json
{
  "domain": "devicesdk",
  "name": "DeviceSDK",
  "version": "0.1.0",
  "documentation": "https://devicesdk.com/docs/guides/home-assistant/",
  "issue_tracker": "https://github.com/device-sdk/devicesdk-monorepo/issues",
  "codeowners": [],
  "config_flow": true,
  "iot_class": "local_push",
  "integration_type": "hub",
  "requirements": [],
  "dependencies": []
}
```

Notes: `iot_class` is `local_push` (live state arrives via the watch WS).
`requirements` is empty - `aiohttp` is provided by HA core. Keep keys in the
order hassfest expects (domain, name, then alphabetical-ish - hassfest will tell
you if it dislikes the order; fix as directed).

**Step 0.3**: Write `hacs.json` at `integrations/home-assistant/hacs.json`:

```json
{
  "name": "DeviceSDK",
  "content_in_root": false,
  "render_readme": true,
  "homeassistant": "2024.12.0"
}
```

(Bump `homeassistant` minimum later if the test harness pulls a newer floor.)

**Step 0.4**: Write `custom_components/devicesdk/const.py`:

```python
"""Constants for the DeviceSDK integration."""
from __future__ import annotations

from datetime import timedelta

DOMAIN = "devicesdk"

CONF_HOST = "host"
CONF_TOKEN = "token"

# Fallback REST resync cadence; live updates come via the watch WebSocket.
UPDATE_INTERVAL = timedelta(minutes=5)

# Watch-WS reconnect backoff bounds (seconds).
WS_RECONNECT_MIN = 2
WS_RECONNECT_MAX = 60

# Command HTTP statuses that mean "device unreachable / no ack".
CMD_OFFLINE_STATUS = 503
CMD_TIMEOUT_STATUS = 504
```

**Step 0.5**: Write `requirements_test.txt`:

```
pytest-homeassistant-custom-component
```

(Leave it unpinned for the first install. After the first green `pytest` run,
pin it to the resolved version - see Maintenance notes. If `pip install` fails
to resolve, STOP and report the conflict.)

**Verify (Phase 0)**:
```bash
cd integrations/home-assistant
python -c "import json,sys; json.load(open('custom_components/devicesdk/manifest.json')); json.load(open('hacs.json')); print('json ok')"
python -m py_compile custom_components/devicesdk/const.py
```
→ prints `json ok`, no compile error.

---

### Phase 1 - API client (`api.py`)

**Step 1.1**: Implement an async client wrapping HA's shared aiohttp session.
Target shape (fill in the bodies; this is the contract the rest of the
integration depends on):

```python
"""Thin async client for the DeviceSDK server REST + watch WebSocket."""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import aiohttp


class DeviceSDKAuthError(Exception):
    """Raised on 401 - bad/expired token."""


class DeviceSDKConnectionError(Exception):
    """Raised when the server is unreachable or returns a non-OK envelope."""


class DeviceSDKCommandError(Exception):
    """Raised when a command fails (device offline/timeout/other)."""


class DeviceSDKClient:
    def __init__(self, session: aiohttp.ClientSession, host: str, token: str) -> None:
        # Normalize: strip trailing slash. Keep scheme as given (http/https).
        self._session = session
        self._host = host.rstrip("/")
        self._token = token

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"}

    async def _get(self, path: str) -> Any:
        """GET {host}{path}, unwrap {success,result}. Raise on auth/transport/envelope errors."""
        ...

    async def list_projects(self) -> list[dict[str, Any]]:
        """All projects (follows pagination). Returns the raw item dicts."""
        ...

    async def list_devices(self, project: str) -> list[dict[str, Any]]:
        ...

    async def get_entities(self, project: str, device: str) -> list[dict[str, Any]]:
        ...

    async def get_status(self, project: str, device: str) -> dict[str, Any]:
        ...

    async def send_command(
        self, project: str, device: str, command_type: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST .../command. Raise DeviceSDKCommandError on 503/504/non-success."""
        ...

    def watch_url(self, project: str, device: str) -> str:
        """ws(s)://.../watch?backfillLimit=0 derived from self._host."""
        ...

    async def watch(
        self, project: str, device: str
    ) -> AsyncIterator[dict[str, Any]]:
        """Connect the watch WS (Authorization header), yield decoded JSON frames.
        Caller owns reconnection; this raises/returns on disconnect."""
        ...
```

Requirements for the bodies:

- `_get`/`send_command`: on HTTP 401 raise `DeviceSDKAuthError`; on
  `aiohttp.ClientError`/timeout raise `DeviceSDKConnectionError`; parse JSON and
  if `success` is not true raise `DeviceSDKConnectionError(result_error)`.
- `send_command`: map HTTP 503 → `DeviceSDKCommandError("device offline")`,
  504 → `DeviceSDKCommandError("command timed out")`, other non-200 →
  `DeviceSDKCommandError`. Return `result` on success.
- Pagination helpers loop `page` from 1 while `has_more` is true,
  `per_page=100`.
- `watch_url`: replace leading `http` with `ws` (so `https`→`wss`, `http`→`ws`)
  and append `/v1/projects/{project}/devices/{device}/watch?backfillLimit=0`.
- `watch`: `self._session.ws_connect(url, headers=self._headers)`; iterate
  `async for msg in ws:`; on `aiohttp.WSMsgType.TEXT` `yield json.loads(msg.data)`;
  stop on `CLOSE`/`ERROR`. Let exceptions propagate to the caller (the
  coordinator handles reconnect/backoff).

**Verify (Phase 1)**: `python -m py_compile custom_components/devicesdk/api.py`
→ exit 0. (Behavioral coverage comes in Phase 6 tests.)

---

### Phase 2 - Config flow (`config_flow.py`, `strings.json`, `translations/en.json`)

**Step 2.1**: Implement a single-step user config flow that collects `host` and
`token`, validates by calling `client.list_projects()`, and creates one config
entry per server.

- Schema: `vol.Schema({ vol.Required(CONF_HOST): str, vol.Required(CONF_TOKEN): str })`.
- Validation: build a `DeviceSDKClient` with the shared session and call
  `list_projects()`. On `DeviceSDKAuthError` → error `{"base": "invalid_auth"}`;
  on `DeviceSDKConnectionError` → `{"base": "cannot_connect"}`; unexpected →
  `{"base": "unknown"}` (and `_LOGGER.exception`).
- Normalize host: ensure it has a scheme; if the user typed `192.168.1.50:8080`
  with no scheme, default to `http://`. Strip trailing slash.
- `await self.async_set_unique_id(normalized_host)` then
  `self._abort_if_unique_id_configured()` so the same server can't be added
  twice.
- Title: the host.

**Step 2.2**: `strings.json` and `translations/en.json` (identical content) with
the config-flow `data` field labels (Server URL, API token), and the error
strings `invalid_auth` / `cannot_connect` / `unknown`, and an
`already_configured` abort string.

**Verify (Phase 2)**:
```bash
python -m py_compile custom_components/devicesdk/config_flow.py
python -c "import json; json.load(open('custom_components/devicesdk/strings.json')); json.load(open('custom_components/devicesdk/translations/en.json')); print('ok')"
```
Full behavioral verification is the config-flow test in Phase 6.

---

### Phase 3 - Coordinator + live WebSocket (`coordinator.py`, `__init__.py`, `entity.py`)

**Step 3.1**: `coordinator.py` - `DeviceSDKCoordinator(DataUpdateCoordinator)`:

- `_async_update_data()` (fallback REST resync every `UPDATE_INTERVAL`):
  for every project → every device, fetch entity declarations + status. Build
  and return a dict keyed by `(project_slug, device_slug)`:
  ```python
  {
    (project, device): {
      "meta": <device item dict>,          # name, etc.
      "project": project, "device": device,
      "entities": [<declaration>, ...],
      "connected": bool,                   # from status
      "states": {<stream_key>: <value>},   # preserved across resyncs (see below)
    },
    ...
  }
  ```
  On resync, **preserve** any `states` already accumulated from the WS (don't
  wipe live values just because a REST resync happened).
- Provide a module-level helper `stream_key(decl: dict) -> str | None`
  implementing the mapping table from "State-frame → declaration mapping":
  ```python
  def stream_key(decl: dict[str, Any]) -> str | None:
      source = decl.get("source")
      pin = decl.get("pin")
      if source == "gpio_state_changed" and pin is not None:
          return f"gpio_pin_{pin}"
      if source == "pin_state_update" and pin is not None:
          return f"gpio_pin_{pin}_analog"
      if source == "temperature_result":
          return "temperature"
      if source == "user":
          return decl["entity_id"]
      return None
  ```
- Start one background WS task per device after the first refresh
  (`async_config_entry_first_refresh` is called in `__init__`). Each task:
  loops forever with exponential backoff between `WS_RECONNECT_MIN` and
  `WS_RECONNECT_MAX`; inside, `async for frame in client.watch(project, device)`:
  - `event == "state"`: write `data[(p,d)]["states"][frame["data"]["entity_id"]]
    = frame["data"]["value"]`, then `self.async_set_updated_data(self.data)`.
  - `event == "status"`: set `data[(p,d)]["connected"] =
    frame["data"]["connected"]`, then `self.async_set_updated_data(self.data)`.
  - ignore `log` / `history_complete`.
  Reset backoff to `WS_RECONNECT_MIN` after a successful connect. Stop the loop
  when the coordinator/config entry is unloading (use an `asyncio.Event` or
  check a `self._shutdown` flag; cancel tasks in unload).
- Expose `self.client` so entities can send commands.
- Track WS tasks in a list; add an `async_shutdown()` that signals shutdown and
  cancels/awaits the tasks.

**Step 3.2**: `__init__.py`:

```python
PLATFORMS = [Platform.BINARY_SENSOR, Platform.SENSOR, Platform.SWITCH, Platform.LIGHT]
```

- `async_setup_entry`: build client (shared session), construct coordinator,
  `await coordinator.async_config_entry_first_refresh()`, start WS tasks, store
  the coordinator in `entry.runtime_data` (HA modern pattern) or
  `hass.data[DOMAIN][entry.entry_id]`, then
  `await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)`.
- `async_unload_entry`: unload platforms, then `await coordinator.async_shutdown()`,
  then clean up stored data. Return the unload result.

**Step 3.3**: `entity.py` - a `DeviceSDKEntity(CoordinatorEntity)` base that:

- Takes `coordinator`, `(project, device)` key, and the declaration dict (or
  `None` for the synthetic connectivity sensor).
- Builds `DeviceInfo` once: `identifiers={(DOMAIN, f"{project}:{device}")}`,
  `name=meta.name or device`, `manufacturer="DeviceSDK"`,
  `model=meta.current_version_id` (optional), and a `configuration_url` of the
  server host.
- `unique_id = f"{entry_id}_{project}_{device}_{entity_id}"` (for the
  connectivity sensor use a fixed suffix like `connectivity`).
- `available` property: `True` only when the coordinator has the device AND
  `data[(p,d)]["connected"]` is true (the connectivity sensor itself is an
  exception - it must stay available so it can report "off"; see Phase 4).
- A helper to read its current stream value:
  `self.coordinator.data[self._key]["states"].get(self._stream_key)`.

**Verify (Phase 3)**:
```bash
python -m compileall custom_components/devicesdk
```
→ exit 0, no errors. (Runtime behavior verified in Phase 6.)

---

### Phase 4 - Read platforms (`binary_sensor.py`, `sensor.py`)

For each platform, `async_setup_entry` reads `coordinator.data`, iterates
devices and their declarations, builds the entities whose `type` matches, and
calls `async_add_entities`.

**Step 4.1 - `binary_sensor.py`**:

- **Connectivity sensor (always, one per device)**: a `BinarySensorEntity`
  (or subclass of the base) with `device_class = BinarySensorDeviceClass.CONNECTIVITY`,
  `is_on = data[(p,d)]["connected"]`, and `available = True` always (it must be
  able to report disconnected). entity name suffix "Connectivity".
- **Declared binary_sensors** (`type == "binary_sensor"`): `is_on` derived from
  the stream value:
  - value is `"high"`/`"low"` (gpio source). If `state_map` is present, the
    declaration maps level→HA state string, e.g.
    `state_map: {high: "off", low: "on"}`; resolve the mapped string and treat
    `"on"`/`"open"`/`"true"`/truthy as on. If no `state_map`, default
    `value == "high"` → on.
  - For `source: "user"` binary_sensors, the value may be a bool/str; treat
    truthy / `"on"` / `"true"` as on.
  - Set `device_class` from the declaration if present (validate against
    `BinarySensorDeviceClass`; if unknown, leave unset rather than crash).
  - Return `None` (unknown) when no value has arrived yet.

**Step 4.2 - `sensor.py`** (`type == "sensor"`):

- `native_value` = the stream value (numbers pass through; the
  `temperature_result` source yields a float °C; `pin_state_update` yields a
  number; `user` yields whatever was emitted).
- `native_unit_of_measurement` = declaration `unit` if present.
- `device_class` from declaration if present and valid (e.g. `"temperature"`,
  `"humidity"`); else unset.
- `state_class = SensorStateClass.MEASUREMENT` for numeric sensors (so HA keeps
  history) - only set it when the value is numeric / a unit is given.

**Verify (Phase 4)**: `python -m compileall custom_components/devicesdk` → exit 0.

---

### Phase 5 - Control platforms (`switch.py`, `light.py`)

**Step 5.1 - `switch.py`** (`type == "switch"`, must have `pin`):

- `is_on`: reflect any known state if a feeding stream exists; otherwise track
  the last commanded state optimistically (store on the entity, update in
  `async_turn_on/off`, then `async_write_ha_state()`).
- `async_turn_on`: `await coordinator.client.send_command(p, d, "set_gpio_state",
  {"pin": pin, "state": "high"})`; on `DeviceSDKCommandError` raise
  `homeassistant.exceptions.HomeAssistantError`. On success set optimistic
  `_is_on = True`.
- `async_turn_off`: same with `"low"`.
- If a switch declaration has no `pin`, skip creating it and log a warning
  (a switch with no pin is not actionable).

**Step 5.2 - `light.py`** (`type == "light"`):

- **PWM** (`light_type == "pwm"`, needs `pin` + `pwm_frequency`):
  `supported_color_modes = {ColorMode.BRIGHTNESS}`, `color_mode = BRIGHTNESS`.
  - `async_turn_on(**kwargs)`: brightness = `kwargs.get(ATTR_BRIGHTNESS, 255)`;
    `duty = brightness / 255`; send `set_pwm_state`
    `{"pin": pin, "frequency": pwm_frequency, "duty_cycle": duty}`. Store
    `_brightness`, `_is_on = True`.
  - `async_turn_off`: send `set_pwm_state` with `"duty_cycle": 0`.
- **WS2812** (`light_type == "ws2812"`, needs `num_leds` + `pin`):
  `supported_color_modes = {ColorMode.RGB}`, `color_mode = RGB`.
  - Maintain a per-entity `_configured` flag. Before the first update in a
    session send `pio_ws2812_configure {"pin": pin, "num_leds": num_leds}` once,
    set `_configured = True`.
  - `async_turn_on(**kwargs)`: rgb = `kwargs.get(ATTR_RGB_COLOR, self._rgb or (255,255,255))`;
    brightness = `kwargs.get(ATTR_BRIGHTNESS, self._brightness or 255)`;
    scaled = `tuple(round(c * brightness / 255) for c in rgb)`; send
    `pio_ws2812_update {"pixels": [list(scaled)] * num_leds}`. Store state.
  - `async_turn_off`: send `pio_ws2812_update` with `[[0,0,0]] * num_leds`.
  - **If a ws2812 light declaration has no `pin`**: create the entity but make
    control raise `HomeAssistantError("ws2812 light requires a 'pin' in its devicesdk.ts declaration")`
    and log a warning at setup. Do NOT guess a pin. (See STOP conditions.)
- Common: raise `HomeAssistantError` on `DeviceSDKCommandError`.

**Verify (Phase 5)**: `python -m compileall custom_components/devicesdk` → exit 0.

---

### Phase 6 - Tests (`tests/`)

Model the test layout on the `pytest-homeassistant-custom-component` README.

**Step 6.1 - `tests/conftest.py`**: include the standard fixture that enables
custom integrations:

```python
import pytest

pytest_plugins = ["pytest_homeassistant_custom_component"]

@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield
```

Add a `tests/__init__.py` and `tests/const.py` with dummy
`HOST = "http://test:8080"`, `TOKEN = "test-token"`.

**Step 6.2 - `tests/test_config_flow.py`** (the most important test): cover
- happy path: patch `DeviceSDKClient.list_projects` to return `[]`; submit
  host+token; assert a config entry is created with the right title/data;
- `invalid_auth`: patch `list_projects` to raise `DeviceSDKAuthError`; assert
  the form re-shows with `errors == {"base": "invalid_auth"}`;
- `cannot_connect`: patch to raise `DeviceSDKConnectionError`; assert
  `{"base": "cannot_connect"}`;
- `already_configured`: second entry with the same host aborts.

**Step 6.3 - `tests/test_init.py`**: set up a config entry with the client fully
mocked (projects/devices/entities/status returning a small fixture, `watch`
returning an async iterator that yields nothing then ends). Assert
`async_setup_entry` returns True, entities are created (e.g. a connectivity
binary_sensor and one declared sensor), and `async_unload_entry` returns True
and cancels WS tasks cleanly (no pending-task warnings).

**Step 6.4 - `tests/test_coordinator.py`**: unit-test `stream_key()` against
each source (gpio→`gpio_pin_15`, pin_state_update→`gpio_pin_26_analog`,
temperature_result→`temperature`, user→literal id, and the `None` fallbacks).
Optionally test that a `state` frame updates the matching entity's value.

**Verify (Phase 6)**:
```bash
cd integrations/home-assistant
python3.13 -m venv .venv && . .venv/bin/activate
pip install -r requirements_test.txt
pytest -q
```
→ all tests pass. If dependency resolution fails, see STOP conditions.

---

### Phase 7 - CI, docs, changeset

**Step 7.1 - CI workflow** `.github/workflows/home-assistant-integration.yml`.
Use **GitHub-hosted `ubuntu-latest`** for these jobs (NOT the self-hosted
`[self-hosted, linux, proxmox-ephemeral]` runners): the hassfest/HACS actions
and a fresh Python toolchain are self-contained on ubuntu-latest and need no
changes to the maintainer's base image. Trigger only on changes under the
integration path:

```yaml
name: Home Assistant Integration

on:
  push:
    branches: [main]
    paths: ["integrations/home-assistant/**", ".github/workflows/home-assistant-integration.yml"]
  pull_request:
    branches: [main]
    paths: ["integrations/home-assistant/**", ".github/workflows/home-assistant-integration.yml"]

permissions:
  contents: read

jobs:
  hassfest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: home-assistant/actions/hassfest@master
        with:
          path: integrations/home-assistant
  hacs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hacs/action@main
        with:
          category: integration
  tests:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: integrations/home-assistant
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r requirements_test.txt
      - run: pytest -q
```

> If the maintainer requires ALL CI on self-hosted runners (not GitHub-hosted),
> STOP and ask before changing the `runs-on` - that needs Python + the HA test
> stack on the proxmox base image, which is the maintainer's call per
> `AGENTS.md` ("CI Runner Image").

Confirm the exact action refs (`home-assistant/actions/hassfest`, `hacs/action`)
still exist; if an action name has changed, STOP and report rather than guessing.

**Step 7.2 - `README.md`** for `integrations/home-assistant/`: short - what it
is, how to install via HACS (custom repo), config (server URL + API token),
link to `https://devicesdk.com/docs/guides/home-assistant/`, and the AGPL-3.0
license line. Note that distribution to HACS is via the mirror repo.

**Step 7.3 - Update the published guide** `docs/public/guides/home-assistant.md`:
the "Roadmap item" blockquote (lines 16) says the HA component "is in progress."
Soften/flip it to reflect that the integration now exists (e.g. "available as a
HACS custom integration; install instructions below"). Keep the existing
Installation / Declaring entities / Supported types sections - they are accurate.
Do NOT claim the `number` entity type works (it is deferred); if you add a row,
mark it "planned." Keep prose em-dash-free (repo rule: use ` - `).

**Step 7.4 - Changeset**: because Step 7.3 edits a doc under `docs/public/`,
add a `@devicesdk/website` patch changeset (per `AGENTS.md`: docs-only changes
under `docs/public/` are covered by a `@devicesdk/website` changeset). Create
`.changeset/<short-random-name>.md`:

```markdown
---
"@devicesdk/website": patch
---

docs: mark the Home Assistant HACS integration as available
```

The new Python integration and CI workflow are **not** pnpm workspace packages,
so they need no other changeset.

**Verify (Phase 7)**:
```bash
# YAML parses
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/home-assistant-integration.yml')); print('yaml ok')"
# changeset present
ls .changeset/*.md
```
hassfest/HACS run in CI (not locally).

---

## Test plan

- New tests live in `integrations/home-assistant/tests/` (Phase 6), using
  `pytest-homeassistant-custom-component`. Cover: config flow (happy +
  invalid_auth + cannot_connect + already_configured), setup/unload, entity
  creation, and `stream_key()` mapping for all four sources.
- Structural pattern: the `pytest-homeassistant-custom-component` README's
  example integration tests (config-flow test + `MockConfigEntry` setup test).
- Verification: from `integrations/home-assistant/`, `pytest -q` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd integrations/home-assistant && python -m compileall custom_components` exits 0
- [ ] `cd integrations/home-assistant && pytest -q` exits 0 with the config-flow,
      setup/unload, and `stream_key` tests present and passing
- [ ] `custom_components/devicesdk/manifest.json` has `"domain": "devicesdk"`,
      `"config_flow": true`, `"iot_class": "local_push"` and parses as JSON
- [ ] `.github/workflows/home-assistant-integration.yml` exists, parses as YAML,
      and its jobs use `runs-on: ubuntu-latest`
- [ ] `grep -rn "?token=" integrations/home-assistant/custom_components` returns
      no matches (token is header-only)
- [ ] A `@devicesdk/website` changeset exists in `.changeset/`
- [ ] No files modified outside the Scope "In scope" list (`git status`) - in
      particular nothing under `apps/`, `packages/`, `firmware/`,
      `pnpm-workspace.yaml`, or `turbo.json`
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any "Server API contract" source file changed since
  `c64cc11` and the actual path/field/frame/command shape differs from this plan.
- `python3.13` is unavailable, or `pip install -r requirements_test.txt` cannot
  resolve a compatible `homeassistant` / `pytest-homeassistant-custom-component`
  pair. (Report the resolver error; do not downgrade Python silently.)
- You find yourself needing to **add or change a server endpoint, command type,
  or response shape** to make something work. That means an assumption here is
  wrong - report it; the fix likely belongs in a separate server plan.
- A controllable declaration is missing the field its command needs and the plan
  doesn't say how to proceed (e.g. a `switch` with no `pin`, or a ws2812 `light`
  with no `pin`) in a way not covered by the "create-but-disable-control + warn"
  guidance above.
- The `hassfest` or `hacs/action` GitHub Action no longer exists at the
  referenced name.
- A verification command fails twice after a reasonable fix attempt.

## Deferred / out of scope (record, don't build)

- **`number` entity platform**: the `HaEntityType` union includes `"number"`,
  but there is **no server command to push a numeric value to a device** (the
  `VALID_COMMAND_TYPES` allow-list in `sendCommand.ts` has no generic
  "set value"), and the published supported-types table in
  `docs/public/guides/home-assistant.md` does not list `number`. Building a
  writable HA `number` entity would require a new server command first. Leave it
  out; a follow-up plan should add the server command, then the platform.
- **HACS distribution mirror repo**: HACS installs an integration from a repo
  that has `custom_components/<domain>/` at its root. This monorepo can't be that
  repo directly. A follow-up should set up a dedicated
  `device-sdk/homeassistant-devicesdk` mirror (e.g. populated by a git subtree
  split or a release workflow) and submit it to the HACS default store. Until
  then users add it as a HACS "custom repository."
- **Device-side state echo for switches/PWM**: switches and PWM lights are
  optimistic (no GPIO-output read-back stream exists today). If a future server
  change emits output state frames, wire them into `is_on`/`brightness`.

## Maintenance notes

For the human/agent who owns this after it lands:

- **Pin the test harness** after the first green run: replace the unpinned
  `pytest-homeassistant-custom-component` in `requirements_test.txt` with the
  resolved `==` version, and bump `hacs.json` `homeassistant` to match the floor
  the harness pulls. HA releases monthly and the test harness tracks it closely;
  expect periodic version bumps.
- **WS reconnection** is the riskiest runtime code. A reviewer should scrutinize:
  backoff bounds, that tasks are cancelled on unload (no "Task was destroyed but
  it is pending" warnings in tests), and that a token rotation / server restart
  recovers without a HA restart.
- **Path identifiers are slugs.** If the server ever switches device/project
  path params from slug to UUID, `api.py` URL construction and the discovery
  loop must change. The drift check covers the relevant files.
- If the server adds a generic "set numeric value" command, revisit the deferred
  `number` platform.
- When the distribution mirror exists, set `codeowners` in `manifest.json` and
  add the HACS default-store submission.
</content>

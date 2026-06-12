# DeviceSDK Roadmap

DeviceSDK is a self-hosted, open-source platform for building home automations
with real microcontrollers: write TypeScript device scripts, deploy them to a
server you run (Raspberry Pi, NUC, NAS), and let your ESP32/Pico devices
connect to it over WebSocket.

This roadmap tracks where the project is going. Items are roughly ordered;
nothing here is a commitment.

## Home Assistant integration

The flagship integration. The server already persists Home Assistant entity
declarations per device (`HaEntityDeclaration` in `@devicesdk/core`, the
`device_entity_configs` table, and `GET/PUT .../entities`) and streams
`state` frames over the watch WebSocket — the groundwork is in place.

- **HACS custom integration** that points at a DeviceSDK server URL + API
  token, discovers projects/devices via the REST API, creates HA entities
  from each device's entity declarations, and subscribes to the watch
  WebSocket for live state (`state` frames → entity updates).
- Service calls back into DeviceSDK (`POST .../command`) so HA automations
  can drive GPIO/PWM/I2C directly.
- Later: an official Home Assistant **add-on** that runs the DeviceSDK server
  itself inside HA OS, making the whole stack one click.

## Discovery & onboarding

- **mDNS advertisement** — _shipped:_ the server advertises an A record for
  `<MDNS_HOSTNAME>.local` (default `devicesdk.local`), and the ESP32/Pico
  firmware resolve `.local` over mDNS, so devices connect without a static IP.
  _Next:_ full DNS-SD service-type advertisement (`_devicesdk._tcp`) so the CLI
  and the HA integration can browse for servers, not just resolve a known name.
- Firmware provisioning improvements: Wi-Fi + server configuration over
  BLE or a captive portal instead of compile-time placeholders.

## CLI dev-engine convergence

`devicesdk dev` still runs the workerd-based simulator. Extract the server's
in-process device runtime (`apps/server/src/runtime/`) into a shared
`packages/device-engine` and run the simulator on it, so local dev semantics
are byte-for-byte the production server's — and the workerd binary dependency
goes away.

## Firmware

- OTA updates: let the server push firmware updates to connected devices
  (today: re-flash over USB).
- Fragmented WebSocket frame reassembly on ESP32 (>2 KB frames are dropped).
- More boards (ESP32-S3, Pico 2 non-W via ethernet hats are candidates).

## Server

- Backup/restore: one-command export/import of /data (SQLite + scripts).
- Optional HTTPS with self-signed or ACME certificates for installs exposed
  beyond the LAN.
- Prometheus-compatible /metrics endpoint.

## Docs & community

- Full documentation pass for self-hosting (the docs still describe the
  hosted-era setup in places).
- Example automation gallery (HA recipes, multi-device RPC patterns).

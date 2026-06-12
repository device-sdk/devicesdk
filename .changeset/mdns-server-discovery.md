---
"@devicesdk/server": minor
"@devicesdk/firmware-esp32": minor
"@devicesdk/firmware-pico": minor
"@devicesdk/website": patch
---

Add mDNS service discovery so devices connect to the server without a static IP.

- **Server**: a zero-dependency multicast-DNS responder (`apps/server/src/foundation/mdns/`,
  over `node:dgram`) advertises the server as `<MDNS_HOSTNAME>.local` (default
  `devicesdk.local`). Two new env vars: `MDNS_HOSTNAME` (rename to run several DeviceSDK
  servers on one LAN) and `MDNS_ENABLED` (default `true`). Started after the janitor and
  stopped on SIGINT/SIGTERM with a TTL-0 goodbye. Covered by the server's first `bun test`
  suite (packet codec + responder).
- **Firmware**: ESP32 (`CONFIG_LWIP_DNS_SUPPORT_MDNS_QUERIES`) and Pico W (`LWIP_IGMP` +
  `LWIP_DNS_SUPPORT_MDNS_QUERIES`) now resolve `.local` hostnames over mDNS, so a device
  flashed with `--host http://devicesdk.local:8080` keeps reaching the server across DHCP
  lease changes. No connection-logic changes — the existing explicit-port heuristic already
  selects plain `ws://` for LAN hosts.
- **Docs**: README, quickstart, and the `flash` CLI reference document flashing against the
  mDNS name; the roadmap marks server-side mDNS advertisement as shipped.

---
"@devicesdk/website": patch
---

Split the combined Hardware Compatibility page into one page per board and promote Hardware to a top-level docs section.

- New URLs: `/docs/hardware/` (hub with cross-board feature matrix), `/docs/hardware/pico-w/`, `/docs/hardware/pico-2w/`, `/docs/hardware/esp32/`, `/docs/hardware/esp32-c3/`, `/docs/hardware/esp32-c61/`.
- The old `/docs/resources/hardware/` URL now meta-refreshes to `/docs/hardware/` (Hugo alias) so external links keep working.
- Adds a dedicated ESP32-C3 page — previously the board was supported in firmware but had no documentation entry.
- Sidebar on docs pages now shows Hardware as its own section with six links (Overview + 5 boards); the Hardware Compatibility entry moves out of Resources.
- Cross-page links in `/docs/cli/flash/`, the SPI/UART/addressable-LED guides, and the docs index updated to the new URL.

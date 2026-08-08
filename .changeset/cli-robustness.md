---
"@devicesdk/cli": patch
---

Robustness and correctness fixes:

- Every API request now has a timeout (60s default, 300s for uploads) instead
  of hanging forever on a stalled server; the watcher WebSocket has a
  handshake timeout
- `devicesdk dev`: cleanup only removes dev's own files (shared
  `.devicesdk/build` and `.devicesdk/firmware` state is preserved), config is
  found in parent directories, workerd crashes restart with bounded backoff,
  startup script errors keep the watcher alive, `--port` is validated,
  SIGTERM is handled, and generated type files can no longer trigger a
  rebuild loop
- `devicesdk flash`: the ESP32 flow only flashes boards that appear after the
  wait starts (no more wrong-board flashing), verifies writes, and prints a
  targeted error for pre-plugged boards; Pico flashing works on Windows
  (removable-drive enumeration) and verifies the copy by size
- Simulator: `onCron` now fires with server-style scheduling, `VARS` is
  populated from the real environment via workerd text bindings, and
  disconnect/ready-state guards prevent crashes in user scripts
- `login`: poll timing follows the server's `expires_in`/`interval`, transient
  errors retry instead of aborting with a stack trace, and credentials store
  the URL that was actually used
- `logs`: reconnect budget only resets after a connection survives 5s, `--lines`
  and `--level` are validated, piped non-tail mode can no longer hang
- Credentials file writes are atomic with 0600 permissions and a corrupt file
  produces a clear message; refresh treats only 401 as session expiry
- `init` validates the project id against the slug schema (the dead `--yes`
  flag was removed); `deploy` checks script size locally and reports per-device
  failures; batch deploys exit non-zero on partial failure
- mDNS discovery retransmits queries instead of relying on a single lossy
  packet; `inspect` no longer hangs on piped EOF during a reboot prompt

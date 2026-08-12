# @devicesdk/docs

## 0.2.1

### Patch Changes

- eefbd27: Document the firmware version handshake: devices report their firmware version and device type, visible in `devicesdk status`, the dashboard, and the API; firmware predating version reporting shows as unknown, and the DHT/1-Wire commands fail fast with a reflash error when the device firmware is known to be too old.

## 0.2.0

### Minor Changes

- 4a39013: Add `NextionDisplay`, a device-script driver for ITEAD Nextion serial HMI displays.

  Import it from the new `@devicesdk/core/nextion` subpath:

  ```ts
  import { NextionDisplay } from "@devicesdk/core/nextion";

  const display = new NextionDisplay(this.env.DEVICE, {
    port: 2,
    txPin: 17,
    rxPin: 16,
    baudRate: 115200,
  });
  await display.connect();
  await display.setPage(0);
  await display.setText("tTitle", "Hello");
  await display.setNumber("nTemp", 215);
  ```

  The driver handles the Nextion wire protocol (ASCII instructions terminated
  by `0xFF 0xFF 0xFF`) over the existing `DEVICE.uart*` API: `setPage`,
  `setText` (quotes/control chars stripped, `\\` and `\r` escapes encoded),
  `setNumber`, `setVisible`, color setters, `refresh`, `get(component,
attribute?)` and `getNumber`. `get` reads in short chunks until the frame
  terminator and **throws** on no reply, truncation, or panel error bytes -
  it never returns an empty or truncated value silently - plus
  `toBytes`/`bytesToAscii` helpers for raw reads. Touch events are **not yet
  supported** - the reactive touch path needs an event-driven UART receive push
  on the firmware and is planned as Phase 2 (see
  `docs/designs/nextion-dev-experience.md`).

  The `devicesdk dev` simulator gains a **UART injector panel**: per-port
  receive buffers, hex-byte input with Nextion touch/get presets, and
  hex+ASCII rendering of `uart_write`/`uart_read` in the event log, so
  request/response exchanges can be exercised without hardware.

  New docs: the [Using Nextion Displays](https://docs.devicesdk.com/guides/using-nextion/)
  guide and a runnable `examples/nextion-dashboard` project.

- 3a687f9: Add DS18B20 (1-Wire) and DHT11/DHT22 sensor support end to end.

  Three new device commands are available from device scripts:
  - `DEVICE.onewireSearch(pin)` - walks the 1-Wire bus and returns one ROM code per DS18B20, so several probes can share a single GPIO.
  - `DEVICE.onewireReadTemperature(pin, rom?)` - reads one addressed probe, or the only probe on the bus when `rom` is omitted (Skip ROM).
  - `DEVICE.dhtRead(pin, "dht11" | "dht22")` - returns temperature and humidity in one command.

  Both firmwares implement the protocols natively: the Pico bit-bangs 1-Wire and DHT on core 1, and the ESP32 drives 1-Wire through `espressif/onewire_bus` (RMT backend, or the UART backend on the ESP32-C61 which has no RMT) with DHT bit-banged in short per-bit critical sections. Scratchpad CRC and DHT checksum failures surface as command errors instead of bogus readings, and DHT reads are rate-limited to one every 2 seconds per pin in firmware.

  The `devicesdk dev` simulator answers all three commands with plausible canned data, and the new `/recipes/ds18b20-probe/` page documents wiring (including the required 4.7 kOhm pull-up) and usage.

## 0.1.1

### Patch Changes

- 99ed8dc: Remove the legacy `docs/public/` directory and the `apps/website` `/docs/` mount. Documentation now lives exclusively in `apps/docs` and is served from `https://docs.devicesdk.com`. The marketing site redirects all `/docs/*` URLs to the new subdomain with the path preserved, and the API reference stays on the main site at `/api/`. The server docs FTS index, README, and hardcoded docs links across the codebase are updated to point to the new docs location.

## 0.1.0

### Minor Changes

- 005a049: Add a new Nimbus-based documentation app (`apps/docs`) and deploy it to `docs.devicesdk.com` as a Cloudflare Workers static site. All existing documentation pages from `docs/public` are copied into `apps/docs/src/content/docs` with rewritten internal links (dropping the `/docs/` prefix) and mapped to the existing sidebar order. The existing website at `devicesdk.com/docs` is left untouched for this initial phase.

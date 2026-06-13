# DeviceSDK ESP32 firmware

ESP-IDF (C) firmware that connects an ESP32-family board to the **DeviceSDK server you run
yourself** over a WebSocket, so your TypeScript device script can drive the hardware
(GPIO, PWM, ADC, I2C, SPI, UART, onboard LED, optional OLED) and receive events back in
real time.

**Supported targets:** ESP32, ESP32-C3, ESP32-C61.

On a LAN the connection is plain `ws://<server>:<port>`; for a bare hostname it uses TLS on
443 (`wss://`). The firmware picks plain WS whenever the configured host contains an
explicit `:port` — see [`main/iotkit_main.c`](main/iotkit_main.c) and the root `CLAUDE.md`
for the heuristic.

## You normally don't build this

End users do **not** compile this firmware. Run:

```bash
devicesdk flash <device>
```

The CLI downloads the prebuilt image for your board (`esp32-client.bin`,
`esp32c3-client.bin`, or `esp32c61-client.bin`) and the server patches **your**
configuration — Wi-Fi SSID/password, API token, server host, and project/device IDs —
into the binary before flashing it over serial (`esptool`). Prebuilt binaries are
published to a rolling GitHub Release and bundled into the Docker image.

The rest of this document is for **firmware contributors** building from source. See
[`IMPLEMENTATIONS.md`](IMPLEMENTATIONS.md) for the architecture.

## Building from source (contributors)

### Prerequisites

- [ESP-IDF](https://docs.espressif.com/projects/esp-idf/en/stable/) (CI pins **v5.5.1**).
  Install and export it (`. $IDF_PATH/export.sh`).
- The managed components are pulled automatically from `main/idf_component.yml`
  (`esp_websocket_client`, `led_strip`).

### Configure, build, flash

```bash
idf.py set-target esp32        # or esp32c3 / esp32c61
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

> The Wi-Fi/token/host/project/device values in [`main/config.h`](main/config.h) are
> **placeholders**. They are patched per device at `devicesdk flash` time — do not commit
> real credentials here. The onboard LED pin/type is configured via
> `idf.py menuconfig` → *IoTKit Configuration* (defaults are set per target in
> `sdkconfig.defaults.<target>`).

The build produces `build/iotkit-client.bin`. CI repackages bootloader + partition table +
app into the per-target `<target>-client.bin` artifacts the CLI flashes (bootloader offset
`0x1000` on ESP32, `0x0` on the RISC-V C3/C61; app at `0x10000`).

## Device status

### Onboard LED (boot blink codes)

- **1 blink** — booting.
- **2 blinks** — Wi-Fi connected.
- **3 blinks** — connected to the DeviceSDK server.

After connecting, the LED (virtual **pin 99**) is available for remote control.

### OLED (boards with the built-in display)

The boot panel shows `Booting` → `WiFi` → `Server` (while the WebSocket is connecting) →
`Connected`. A panel stuck on `Server` means the device reached Wi-Fi but never finished
connecting to your server. On disconnect it reverts to `Server` and retries (with backoff
if the server rate-limits reconnections).

## Remote control protocol

Once connected, the device handles `{ "type": ..., "payload": ... }` command frames over
the WebSocket and replies with `command_ack` / a typed `*_result` / `command_error`, plus
`pin_state_update` events for monitored inputs. Supported commands include `set_gpio_state`,
PWM, the I2C/SPI/UART families, `get_temperature`, `watchdog_*`, and `reboot`. From a device
script you use the higher-level `this.env.DEVICE` API rather than raw frames; this is the
underlying firmware protocol (see [`IMPLEMENTATIONS.md`](IMPLEMENTATIONS.md)).

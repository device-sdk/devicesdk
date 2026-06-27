# DeviceSDK Basic Example

A minimal DeviceSDK project demonstrating the canonical building blocks:

- A device entrypoint extending `DeviceEntrypoint`
- The lifecycle hooks (`onDeviceConnect`, `onMessage`, `onDeviceDisconnect`)
- GPIO output (onboard LED on virtual pin 99)
- I2C OLED display via the bundled `SSD1306` helper
- Button input via `configureGpioInputMonitoring()` and `gpio_state_changed` events
- Per-device KV state (`this.env.DEVICE.kv.put` / `.get`)

## Quickstart

```bash
pnpm install

# Edit devicesdk.ts: set real WiFi credentials.
# Optionally pick a different deviceType (pico-w, pico2-w, esp32, esp32c3, esp32c61).
$EDITOR devicesdk.ts

pnpm deploy
pnpm flash-remote   # Pico in BOOTSEL mode, or ESP32 plugged in
```

## Layout

| File | What it is |
|------|------------|
| `devicesdk.ts` | Project + device configuration |
| `src/devices/device.ts` | Main device entrypoint (button + LED + OLED) |
| `src/devices/button.ts` | Alternate: button-only example |
| `src/devices/door-sensor.ts` | Alternate: door reed switch with HA entity |

To switch which device file is active, edit the `main:` field in `devicesdk.ts`.

## Hardware notes

- Onboard LED is on **virtual pin 99** for both Pico W and supported ESP32 boards (DeviceSDK normalizes this so your code works across targets).
- The OLED expects **I2C bus 0** with **GP0 = SDA, GP1 = SCL** on the Pico.
- The button is on **GP20** with the internal pull-up enabled.

## Local development

`pnpm deploy` and `pnpm flash-remote` target whichever server you logged into. Run `devicesdk login` to authenticate - the CLI discovers your server over mDNS automatically. Use `--host` if mDNS doesn't work on your network, you're using a custom hostname, or the CLI runs on the same machine as the server:

```bash
devicesdk login                                      # auto-discovers via mDNS
devicesdk login --host http://devicesdk.local:8080   # explicit mDNS name
devicesdk login --host http://192.168.1.42:8080      # by IP
```

DeviceSDK is self-hosted, so "your server" is wherever you're running it.

If you're running the server on the same machine (e.g. you're hacking on the server
itself), the `local:*` / `flash-local` helpers point at `http://localhost:8080`:

```bash
pnpm local:login
DEVICESDK_API_URL=http://localhost:8080 pnpm deploy
DEVICESDK_DEVICE_HOST=192.168.1.42:8080 pnpm flash-local   # set to your laptop's LAN IP
```

## See also

- [Quickstart](https://devicesdk.com/docs/quickstart/)
- [Device Entrypoints](https://devicesdk.com/docs/concepts/entrypoints/)
- [Cookbook](https://devicesdk.com/docs/recipes/)

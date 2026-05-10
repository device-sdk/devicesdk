# DeviceSDK Basic Example

A minimal DeviceSDK project demonstrating the canonical building blocks:

- A device entrypoint extending `DeviceEntrypoint`
- The lifecycle hooks (`onDeviceConnect`, `onMessage`, `onDeviceDisconnect`)
- GPIO output (onboard LED on virtual pin 99)
- I2C OLED display via the bundled `SSD1306` helper
- Button input via `Pico.gpio({ pin, pull: 'up' })` and `pin_state_update` events
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

If you're running a local DeviceSDK API on `localhost:8787` (rare — only relevant for SDK contributors):

```bash
pnpm local:login
DEVICESDK_API_URL=http://localhost:8787 pnpm deploy
DEVICESDK_DEVICE_HOST=192.168.1.42:8787 pnpm flash-local   # set to your laptop's LAN IP
```

For everyday use, ignore the `local:*` and `flash-local` scripts — `pnpm deploy` and `pnpm flash-remote` against the production API are what you want.

## See also

- [Quickstart](https://devicesdk.com/docs/quickstart/)
- [Device Entrypoints](https://devicesdk.com/docs/concepts/entrypoints/)
- [Cookbook](https://devicesdk.com/docs/recipes/)

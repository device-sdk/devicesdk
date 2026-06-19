# DeviceSDK Pico firmware

C/C++ firmware (`devicesdk-client`) for the Raspberry Pi **Pico W** and **Pico 2 W**. It
connects the board to Wi-Fi and opens a persistent WebSocket to the **DeviceSDK server you
run yourself** (on your LAN), so your TypeScript device script can drive the hardware
(GPIO, I2C, SPI, UART, onboard LED) and receive events back in real time.

On a LAN the connection is plain `ws://<server>:<port>`; for a bare hostname it uses TLS on
443. See the root `AGENTS.md` for the host/port heuristic.

## You normally don't build this

End users do **not** compile this firmware. Run:

```bash
devicesdk flash <device>
```

The CLI downloads a prebuilt firmware image and the server patches **your** configuration
— Wi-Fi SSID/password, API token, server host, and project/device IDs — into the binary
before it's written to the board. Prebuilt binaries are published to versioned GitHub
Releases (tagged `firmware-pico@vX.Y.Z`) only when the changeset "Version packages"
PR bumps the firmware version, and bundled into the Docker image.

The rest of this document is for **firmware contributors** building from source.

## Building from source (contributors)

### Prerequisites

1. **[Raspberry Pi Pico SDK](https://github.com/raspberrypi/pico-sdk)** installed and configured.
2. **CMake** and **Ninja**.
3. The ARM toolchain and `picotool` (the Pico VS Code extension installs these under `~/.pico-sdk`).

### Board selection

The target board defaults to `pico2_w`. Override it with the `DEVICESDK_BOARD` environment
variable before configuring:

```bash
export DEVICESDK_BOARD="pico_w"   # or "pico2_w"
```

> The Wi-Fi/token/host/project/device values in `CMakeLists.txt` are **placeholders**.
> They are patched per device at `devicesdk flash` time — do not put real credentials here.

### Build

```bash
rm -rf build                      # clean build (recommended after config changes)
cmake -S . -B build -G "Ninja"
ninja -C build
```

This produces `build/devicesdk-client.uf2`.

### Flash

For a from-source build, put the Pico into **BOOTSEL** mode (hold BOOTSEL while plugging
in — it mounts as `RPI-RP2`) and either drag `devicesdk-client.uf2` onto the drive, or use
`picotool`:

```bash
picotool load build/devicesdk-client.uf2
```

## Device status & remote control

### LED status codes

The onboard LED indicates the device's status:

- **Booting**: three rapid blinks on startup.
- **Wi-Fi connection failure**: one long blink, repeating.
- **WebSocket connection failure**: two long blinks then one short blink, repeating (retries every 5 seconds).
- **Connected**: five rapid blinks, then the LED turns off and becomes available for remote control.

### Remote LED control

Once connected, the onboard LED (virtual **pin 99**) responds to `set_gpio_state` commands
over the WebSocket:

```json
{ "type": "set_gpio_state", "payload": { "pin": 99, "state": "high" } }
```

Send `"state": "low"` to turn it off. From a device script you'd use the higher-level
`this.env.DEVICE` API rather than raw frames; this is the underlying firmware protocol.

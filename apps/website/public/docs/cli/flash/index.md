---
title: "devicesdk flash"
description: "Flash firmware to Raspberry Pi Pico and ESP32"
url: http://localhost:1313/docs/cli/flash/
---

# devicesdk flash

> Flash firmware to Raspberry Pi Pico and ESP32


> **Note:** Flashing is typically **one-time per device**. After initial flashing, updates are delivered **over-the-air (OTA)**. Only major firmware upgrades may need a repeat flash, and even those are optional unless you want the new firmware capabilities.

## Usage

```bash
devicesdk flash <device-id> [flags]
```

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-c, --config <path>` | Path to `devicesdk.ts` config file | Auto-detected |
| `-t, --timeout <ms>` | Time to wait for device (milliseconds) | 30000 (Pico), 60000 (ESP32) |
| `-p, --port <port>` | Serial port for ESP32 (e.g. `/dev/ttyUSB0`) | Auto-detected |
| `-b, --baud <rate>` | Baud rate for ESP32 flashing | 460800 |
| `--before <method>` | Reset method before flashing (`default_reset` or `no_reset`) | `default_reset` |
| `--host <url>` | Download firmware from a custom host | Production API |

## Description

Flashes the DeviceSDK firmware to your microcontroller, including:
- WebSocket client
- Device credentials
- Hardware abstraction layer
- Automatic reconnection logic

The CLI automatically detects the device type from your `devicesdk.ts` config and uses the appropriate flashing method.

## Supported Hardware

- **Raspberry Pi Pico W**
- **Raspberry Pi Pico 2W**
- **ESP32** (Xtensa)
- **ESP32-C61** (RISC-V)

## Pico Flashing Process

1. Put the Pico in BOOTSEL mode (see below)
2. Run `devicesdk flash <device-id>`
3. CLI detects the USB drive and begins flashing
4. Wait for completion (30-60 seconds)
5. Device reboots and connects

### BOOTSEL Mode

To enter BOOTSEL mode:

1. **Disconnect** the Pico from USB
2. **Hold** the BOOTSEL button
3. **Connect** USB while holding button
4. **Release** button

The Pico appears as a USB drive named `RPI-RP2` (Pico W) or `RP2350` (Pico 2W).

## ESP32 Flashing Process

### Prerequisites

Install esptool (the ESP32 flash tool):

```bash
pip install esptool
```

Verify it's installed:

```bash
esptool.py version
```

### Serial port permissions (Linux)

Your user needs write access to the serial port. The fix depends on your distribution:

```bash
# Debian / Ubuntu / Fedora — group is `dialout`
sudo usermod -a -G dialout $USER

# Arch Linux — group is `uucp`
sudo usermod -a -G uucp $USER

# Then log out and back in for the group change to take effect.
```

If you'd rather not log out, or you want the permission to survive replug without juggling groups, install a udev rule. The snippet below grants access to the most common ESP32 USB-UART chips (CP210x, CH340, FTDI FT232) for any user in the `plugdev` group:

```bash
sudo tee /etc/udev/rules.d/99-devicesdk-serial.rules > /dev/null <<'EOF'
# DeviceSDK — ESP32 USB-UART bridges
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", GROUP="plugdev", MODE="0660"
SUBSYSTEM=="tty", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", GROUP="plugdev", MODE="0660"
SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", GROUP="plugdev", MODE="0660"
EOF
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -a -G plugdev $USER
# Log out and back in once.
```

### How It Works

1. Connect the ESP32 board via USB
2. Run `devicesdk flash <device-id>`
3. CLI auto-detects the serial port (`/dev/ttyUSB0`, `/dev/ttyACM0`, or `/dev/cu.usb*`)
4. esptool writes the firmware over serial
5. Device resets and connects

### Serial Port Detection

The CLI automatically scans for serial ports:
- **Linux**: `/dev/ttyUSB*` and `/dev/ttyACM*`
- **macOS**: `/dev/cu.usb*`, `/dev/cu.SLAB_USBtoUART*`, `/dev/cu.wchusbserial*`

If auto-detection doesn't work, specify the port manually with `--port`.

### Boot Mode (Manual Reset)

Most ESP32 boards auto-reset into download mode when flashing. If your board doesn't support auto-reset (you'll see "No serial data received"), enter boot mode manually:

1. Hold the **BOOT** button
2. While holding BOOT, press and release the **RESET** button
3. Release the BOOT button
4. Flash with `--before no_reset`:

```bash
devicesdk flash my-device --before no_reset
```

Some boards have a jumper (e.g. J5) that forces boot mode when shorted.

## Examples

Flash a Pico W:
```bash
devicesdk flash my-sensor-001
```

Flash an ESP32:
```bash
devicesdk flash my-esp32-device
```

Flash ESP32 on a specific serial port:
```bash
devicesdk flash my-device --port /dev/ttyUSB0
```

Flash ESP32 with manual boot mode (no auto-reset):
```bash
devicesdk flash my-device --before no_reset
```

Flash ESP32 with lower baud rate (for unreliable USB bridges):
```bash
devicesdk flash my-device --baud 115200
```

Flash using a local API server:
```bash
devicesdk flash my-device --host http://192.168.1.238:8787
```

Custom timeout:
```bash
devicesdk flash my-device --timeout 120000
```

## Device Credentials

The firmware is flashed with embedded credentials that:
- Authenticate with DeviceSDK
- Associate with your project
- Enable secure communication

Credentials are unique per device and stored securely in flash memory.

## After Flashing

Once flashed:
1. Device reboots automatically
2. Connects to DeviceSDK
3. Runs your deployed code
4. Appears in dashboard as online

### Verify connectivity

The on-board LED blinks a status sequence after reboot (1 = booted, 2 = Wi-Fi connected, 3 = cloud connected). To confirm cloud-side that the device is online — useful when the LED is hard to see, or when you want to know which firmware version is running — run [`devicesdk status`](/docs/cli/status/):

```bash
devicesdk status
# DEVICE       STATUS    VERSION   LAST SEEN
# my-sensor-1  ● online  a1b2c3d4  2s ago
```

Status reads the live edge connection state, so it flips to `● online` within a second of the device's WebSocket handshake.

## WiFi Configuration

For Pico W, configure WiFi after flashing:

1. Device creates a WiFi access point
2. Connect to `DeviceSDK-XXXX`
3. Open browser to configure
4. Enter your WiFi credentials
5. Device reconnects with your network

For ESP32, WiFi credentials are embedded in the firmware at flash time.

## Firmware Updates

To update firmware on an already-flashed device:
1. Enter BOOTSEL mode (Pico) or connect via USB (ESP32)
2. Run `devicesdk flash <device-id>`
3. New firmware is written

## Troubleshooting

### Pico

**Device not detected?**
- Ensure BOOTSEL mode is active — the Pico should appear as a USB drive (`RPI-RP2` or `RP2350`)
- Check USB cable supports data (not power-only)
- Try a different USB port

**Timeout waiting for device?**

```bash
devicesdk flash my-device --timeout 120000
```

### ESP32

**"esptool.py is not installed"?**
- Install with `pip install esptool`
- Ensure `esptool.py` is in your PATH

**"Serial port not accessible (permission denied)"?**
- See [Serial port permissions (Linux)](#serial-port-permissions-linux) above for the full fix (group on Debian/Ubuntu vs Arch, plus a persistent udev rule)
- Verify with `groups` that the relevant group (`dialout` or `uucp`) appears for your user

**"No serial data received"?**
- Your board likely doesn't support auto-reset
- Enter boot mode manually (hold BOOT, press RESET, release BOOT)
- Flash with `--before no_reset`
- If your board has two USB-C ports, try the USB-JTAG port (shows as `/dev/ttyACM0`) instead of the UART port (`/dev/ttyUSB0`)

**Flash hangs or fails mid-transfer?**
- Lower the baud rate: `--baud 115200`
- Try a different USB cable or port
- Some USB hubs cause issues — connect directly to the computer

### General

**Device won't connect after flashing?**
- Check WiFi configuration
- Verify device appears in dashboard
- Check device logs for errors

## Multiple Devices

Flash multiple devices by running the command for each device:

```bash
devicesdk flash sensor-1
# Wait for completion, switch device
devicesdk flash sensor-2
# Repeat...
```

## CI/CD

Flashing requires physical hardware connection and cannot be automated in CI/CD. Flash devices manually during provisioning.

## Related Commands

- [devicesdk deploy](/docs/cli/deploy/) - Deploy code to flashed devices

## Hardware Guide

Need help with hardware setup? See:
- [Hardware Compatibility](/docs/hardware/)
- [Your First Device](/docs/first-device/)


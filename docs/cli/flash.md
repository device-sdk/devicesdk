---
title: devicesdk flash
description: Flash firmware to Raspberry Pi Pico
social_image: /og-images/docs/cli/flash.png
---

> **Note:** Flashing is typically **one-time per device**. After initial flashing, updates are delivered **over-the-air (OTA)**. Only major firmware upgrades may need a repeat flash, and even those are optional unless you want the new firmware capabilities.

## Usage

```bash
devicesdk flash [flags]
```

## Flags

- `--timeout <seconds>` - Wait timeout for BOOTSEL mode (default: 30)
- `--device-id <id>` - Provision with specific device ID

## Description

Flashes the DeviceSDK firmware to your Raspberry Pi Pico, including:
- WebSocket client
- Device credentials
- Hardware abstraction layer
- Automatic reconnection logic

## Supported Hardware

Currently supported:
- **Raspberry Pi Pico W**
- **Raspberry Pi Pico 2W**

Coming soon:
- ESP32 series
- Additional RP2040 boards

## Flashing Process

1. Put device in BOOTSEL mode (see below)
2. Run `devicesdk flash`
3. CLI detects device and begins flashing
4. Wait for completion (30-60 seconds)
5. Device reboots and connects

## BOOTSEL Mode

To enter BOOTSEL mode:

1. **Disconnect** the Pico from USB
2. **Hold** the BOOTSEL button
3. **Connect** USB while holding button
4. **Release** button

The Pico appears as a USB drive named "RPI-RP2".

## Examples

Flash device:
```bash
devicesdk flash
```

Flash with specific device ID:
```bash
devicesdk flash --device-id my-sensor-001
```

Custom timeout:
```bash
devicesdk flash --timeout 60
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

## WiFi Configuration

For Pico W, configure WiFi after flashing:

1. Device creates a WiFi access point
2. Connect to `DeviceSDK-XXXX`
3. Open browser to configure
4. Enter your WiFi credentials
5. Device reconnects with your network

Or configure programmatically in your device code.

## Firmware Updates

To update firmware on an already-flashed device:
1. Enter BOOTSEL mode again
2. Run `devicesdk flash`
3. New firmware is written

Existing credentials are preserved unless you specify a new device ID.

## Troubleshooting

**Device not detected?**

Ensure BOOTSEL mode is active. The Pico should appear as a USB drive.

**Flashing fails?**

- Check USB cable (must support data, not power-only)
- Try a different USB port
- Ensure no other programs are accessing the drive

**Device won't connect after flashing?**

- Check WiFi configuration (Pico W)
- Verify device appears in dashboard
- Check device logs for errors

**Timeout waiting for device?**

Increase timeout:
```bash
devicesdk flash --timeout 120
```

## Multiple Devices

Flash multiple devices by running the command for each device:

```bash
devicesdk flash --device-id sensor-1
# Wait for completion, switch device
devicesdk flash --device-id sensor-2
# Repeat...
```

## CI/CD

Flashing requires physical hardware connection and cannot be automated in CI/CD. Flash devices manually during provisioning.

## Related Commands

- [devicesdk deploy](/docs/cli/deploy/) - Deploy code to flashed devices

## Hardware Guide

Need help with hardware setup? See:
- [Hardware Compatibility](/docs/resources/hardware/)
- [Your First Device](/docs/first-device/)

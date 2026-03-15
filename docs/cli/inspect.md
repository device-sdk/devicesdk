---
title: devicesdk inspect
description: Interactive hardware inspection — send commands directly to a connected device from your terminal
social_image: /og-images/docs/cli/inspect.png
---

## Usage

```bash
devicesdk inspect <device-id> [flags]
```

## Flags

- `--project <id>` - Project ID (if no `devicesdk.ts` config file is present)
- `-c, --config <path>` - Path to the `devicesdk.ts` config file

## Description

`devicesdk inspect` opens an interactive REPL that lets you send hardware commands directly to a connected device without writing or deploying a device script. This is useful for verifying hardware wiring, debugging sensors, and exploring pin states in real-time.

The device must have an active WebSocket connection (i.e. the firmware must be running and connected to the DeviceSDK platform). If the device is offline, commands will return an error but the REPL will remain open so you can retry once the device connects.

## Available Commands

| Command | Description |
|---|---|
| `gpio read <pin>` | Read digital pin state (returns HIGH or LOW) |
| `gpio write <pin> high\|low` | Set GPIO output state |
| `adc read <pin>` | Read analog pin value (0–4095 on most boards) |
| `pwm <pin> <frequency> <duty_cycle>` | Set PWM output (frequency in Hz, duty cycle 0–100) |
| `i2c scan [bus]` | Scan for I2C devices on a bus (default bus 0) |
| `i2c configure <bus> <sda> <scl> [freq]` | Configure I2C bus pins (frequency in Hz, default 100000) |
| `i2c read <bus> <addr> <bytes> [register]` | Read bytes from an I2C device |
| `i2c write <bus> <addr> <data...>` | Write bytes to an I2C device |
| `monitor <pin> [up\|down\|none]` | Enable GPIO input monitoring with optional pull resistor |
| `reboot` | Reboot the device (prompts for confirmation) |
| `help` | Show available commands |
| `exit` / Ctrl-C | Exit inspect mode |

## Examples

### Verify an LED is on the correct pin

```
devicesdk:my-device> gpio write 2 high
OK
devicesdk:my-device> gpio write 2 low
OK
```

### Read a button state

```
devicesdk:my-device> gpio read 14
Pin 14: LOW
```

### Scan for I2C sensors

```
devicesdk:my-device> i2c scan
Found 2 device(s) on bus 0: 0x3C, 0x76
```

### Read from a BME280 pressure sensor (I2C address 0x76)

```
devicesdk:my-device> i2c configure 0 21 22
OK
devicesdk:my-device> i2c read 0 0x76 6 0xF7
Read from 0x76: [0x51, 0x4C, 0x00, 0x84, 0xD1, 0x00]
```

### Read an analog sensor value

```
devicesdk:my-device> adc read 34
Pin 34 (analog): 2048
```

## Error Handling

- **Device not connected** — the REPL stays open; retry the command once the device connects
- **Command timeout** — the device did not respond within 5 seconds; the REPL stays open
- **Concurrent commands** — typing a command while one is in flight will show a warning and discard the input

## Notes

- The `reboot` command prompts for confirmation (`[y/N]`) to prevent accidental reboots
- I2C addresses can be specified in hex (`0x76`) or decimal (`118`)
- The REPL prompt shows the device ID: `devicesdk:<device-id>>`

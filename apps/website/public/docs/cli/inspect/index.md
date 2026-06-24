---
title: "devicesdk inspect"
description: "Interactive REPL for sending hardware commands to a connected device"
url: http://localhost:1313/docs/cli/inspect/
---

# devicesdk inspect

> Interactive REPL for sending hardware commands to a connected device


## Usage

```bash
devicesdk inspect <device> [flags]
```

## Arguments

- `<device>` - Device slug to connect to (required)

## Flags

- `--project <id>` - Project ID (overrides config file)
- `--config <path>` - Path to config file (default: `devicesdk.ts`)

## Description

The `inspect` command opens an interactive REPL (Read-Eval-Print Loop) that lets you send hardware commands directly to a connected device and see the results in real time. This is useful for debugging hardware, testing pin states, and exploring I2C peripherals without writing code.

The device must be online (connected to the DeviceSDK platform) for commands to work.

Commands are sent sequentially — if you send input via a pipe, each command waits for a response before the next is processed.

## Available Commands

| Command | Description |
|---------|-------------|
| `gpio read <pin>` | Read digital pin state (HIGH or LOW) |
| `gpio write <pin> high\|low` | Set a GPIO output pin |
| `adc read <pin>` | Read analog pin value |
| `pwm <pin> <frequency> <duty_cycle>` | Set PWM output |
| `i2c scan [bus]` | Scan for I2C devices on a bus (default: bus 0) |
| `i2c configure <bus> <sda> <scl> [freq]` | Configure I2C bus pins and frequency |
| `i2c read <bus> <addr> <bytes> [register]` | Read bytes from an I2C device |
| `i2c write <bus> <addr> <data...>` | Write bytes to an I2C device |
| `monitor <pin> [up\|down\|none]` | Enable GPIO input change monitoring |
| `reboot` | Reboot the device (prompts for confirmation) |
| `help` | Show available commands |
| `exit` / `quit` / Ctrl-C | Exit inspect mode |

## Examples

Open inspect session for a device:
```bash
devicesdk inspect temperature-sensor
```

Specify project explicitly:
```bash
devicesdk inspect temperature-sensor --project my-project-id
```

Pipe commands for automation:
```bash
echo "gpio read 5" | devicesdk inspect temperature-sensor
```

## Interactive Session Example

```
Connecting to device "temperature-sensor" in project "my-project"...
Type "help" for available commands, "exit" to quit.

devicesdk:temperature-sensor> gpio read 5
Pin 5: HIGH
devicesdk:temperature-sensor> i2c scan
Found 1 device(s) on bus 0: 0x48
devicesdk:temperature-sensor> i2c read 0 0x48 2
Read from 0x48: [0x1A, 0xC0]
devicesdk:temperature-sensor> exit
Goodbye.
```

## Exit Codes

- `0` — clean exit (user typed `exit` or closed the REPL)
- `1` — authentication error or unhandled API error


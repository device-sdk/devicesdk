# Nextion Serial Display Guide

This guide covers how to use **Nextion** HMI displays with DeviceSDK. Nextion
(ITEAD) panels are serial touch displays that speak their own ASCII
instruction set over a single UART link.

## Overview

The `NextionDisplay` class wraps the `DEVICE.uart*` methods so device scripts
can talk to a Nextion panel with typed calls instead of hand-built hex byte
arrays. Every Nextion instruction is ASCII text terminated by three mandatory
`0xFF 0xFF 0xFF` bytes; the driver handles that encoding for you.

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { NextionDisplay } from '@devicesdk/core/nextion';

export class MyDevice extends DeviceEntrypoint {
  private display = new NextionDisplay(this.env.DEVICE, {
    port: 2,        // ESP32 UART2 (UART0 is the debug console)
    txPin: 17,      // to the panel's RX
    rxPin: 16,      // to the panel's TX
    baudRate: 115200, // must match the panel's setting in the Nextion Editor
  });

  async onDeviceConnect() {
    await this.display.connect();
    await this.display.setPage(0);
    await this.display.setText('tTitle', 'Hello Nextion!');
    await this.display.setNumber('nTemp', 215); // nTemp.val=215
  }
}
```

## Prerequisites

1. Design the screen (pages, text/number components, images) in the Nextion
   Editor on a PC.
2. Flash the compiled `.tft` file to the panel - over serial from the Editor,
   or via microSD. This step is outside DeviceSDK.
3. Note the **baud rate** configured in the Editor (default 9600; 115200 is
   common). The driver must be constructed with the same rate.

## Wiring

Nextion panels run on 5V power but use **3.3V logic levels** on the serial
pins. Connect:

| Panel pin | MCU pin |
|-----------|---------|
| RX (panel) | MCU TX (3.3V logic) |
| TX (panel) | MCU RX (3.3V logic) |
| VCC / VIN | 5V power supply (external if needed) |
| GND | common ground |

UART ports per platform:

| Platform | Ports | Notes |
|----------|-------|-------|
| ESP32 | 1, 2 | port 0 is reserved for the debug console |
| Pico W / Pico 2 W | 0, 1 | both available |

Common ESP32 DevKit wiring: UART2 with TX=GPIO17, RX=GPIO16.

## API

### `new NextionDisplay(device, options)`

| Option | Default | Description |
|--------|---------|-------------|
| `port` | - | UART port (ESP32: 1-2, Pico: 0-1) |
| `txPin` | - | UART TX pin to the panel's RX |
| `rxPin` | - | UART RX pin to the panel's TX |
| `baudRate` | 9600 | Must match the panel's configured speed |
| `getBufferSize` | 64 | Max bytes read for a `get` reply |
| `getTimeoutMs` | 500 | Timeout in ms for `get` replies |

### Methods

| Method | Nextion instruction |
|--------|---------------------|
| `connect()` | `uart_configure` for the port/pins/baud |
| `setPage(page)` | `page <n>` |
| `setText(component, value)` | `<comp>.txt="<value>"` (quotes escaped) |
| `setNumber(component, value)` | `<comp>.val=<value>` |
| `setVisible(component, visible)` | `vis <comp>,<0/1>` |
| `setTextColor(component, color)` | `pco <comp>,<color>` |
| `setBackgroundColor(component, color)` | `bco <comp>,<color>` |
| `refresh(component)` | `ref <comp>` |
| `get(component)` | `get <comp>.<attr>` - resolves with the reply, terminator stripped |
| `sendRaw(instruction)` | raw instruction + terminator, for anything not covered |

### Static helpers

| Helper | Description |
|--------|-------------|
| `toBytes(text)` | UTF-8 encode `text` to `"0x.."` hex-string bytes |
| `bytesToAscii(bytes)` | Decode `"0x.."` hex-string bytes back to text |
| `frameEnd()` | The mandatory `["0xFF", "0xFF", "0xFF"]` terminator |

## Reading values with `get`

```typescript
const reply = await this.display.get('nTemp.val');
// "25" on most firmware versions (some reply in hex - parse accordingly)
```

`get` is request/response: the panel answers with the value plus the
`0xFF 0xFF 0xFF` terminator, which the driver strips. Reply frames longer
than `getBufferSize` bytes are truncated - use it for short values.

## Reading raw responses (pull model)

The driver's `get` uses `DEVICE.uartRead`, which is pull-based. For data the
panel pushes on its own (boot strings, `get` replies, touch events), read
from the port directly:

```typescript
const response = await this.env.DEVICE.uartRead(2, 64, 500);
if (response.type === 'uart_read_result') {
  const text = NextionDisplay.bytesToAscii(response.payload.data);
  console.log(`panel says: ${text}`);
}
```

## Touch events

**Touch events are not yet supported.** Receiving them requires an
event-driven UART receive path on the firmware (a `uart_monitor` command that
pushes incoming bytes as `uart_data` events). That is planned as Phase 2 - see
`docs/designs/nextion-dev-experience.md` in the repo root. Until it lands,
scripts that need touch input must poll `DEVICE.uartRead` on a cron.

The `devicesdk dev` simulator can inject raw bytes into a port's receive
buffer, which lets you exercise request/response logic (including `get`)
without hardware.

## Tips

1. **Match the baud rate** - if the panel shows garbage or the boot string
   (`comok ...`) never arrives, the panel's configured rate differs from the
   driver's.
2. **Power the panel separately** - larger panels can draw more than the MCU
   regulator can supply.
3. **Keep values short** - text components have a fixed length in the Editor;
   longer strings are truncated by the panel itself.
4. **Use `sendRaw` for one-off instructions** - e.g. `dim=50` for backlight
   brightness, `sleep=1` / `wake=1`, `cls` to clear a page.

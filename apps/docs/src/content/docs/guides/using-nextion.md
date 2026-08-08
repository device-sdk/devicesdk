---
title: Using Nextion Displays
description: Drive ITEAD Nextion serial HMI panels from your device scripts with the NextionDisplay driver
sidebar:
  order: 999
---

Nextion (ITEAD) panels are serial touch displays that run a self-contained
screen design. You create the screens - pages, text and number components,
images - in the Nextion Editor on a PC, flash the compiled `.tft` file to the
panel, and then drive the components from your device script over UART.

## Platform Support

| Platform | Ports | Notes |
|----------|-------|-------|
| ESP32 | UART1, UART2 | UART0 reserved for debug console |
| Pico W / Pico 2 W | UART0, UART1 | Both available |
| Simulator | ports 0-2 | `uart_*` mock + byte injector (UART panel) |

## Wiring

Nextion panels run on 5V power but expose **3.3V logic levels** on their
serial pins.

| Nextion pin | Connect to |
|-------------|------------|
| RX | MCU TX pin |
| TX | MCU RX pin |
| VIN / VCC | 5V supply (external for larger panels) |
| GND | common ground |

A common ESP32 DevKit setup uses UART2: TX=GPIO17, RX=GPIO16.

## How the Driver Helps

Every Nextion instruction is ASCII text terminated by three mandatory
`0xFF 0xFF 0xFF` bytes, and the raw `DEVICE.uartWrite` API takes hex-string
byte arrays - so talking to a panel by hand means encoding every command. The
`NextionDisplay` driver handles the encoding, termination, and replies:

```typescript
import { DeviceEntrypoint } from "@devicesdk/core";
import { NextionDisplay } from "@devicesdk/core/nextion";

export class MyDevice extends DeviceEntrypoint {
  private display = new NextionDisplay(this.env.DEVICE, {
    port: 2,            // ESP32 UART2 (UART0 is the debug console)
    txPin: 17,
    rxPin: 16,
    baudRate: 115200,   // must match the panel's setting in the Editor
  });

  async onDeviceConnect() {
    await this.display.connect();
    await this.display.setPage(0);
    await this.display.setText("tTitle", "Heater control");
    await this.display.setNumber("nTemp", 215);
  }
}
```

The baud rate must match the one configured in the Nextion Editor (default
9600; 115200 is common).

## API

### Constructor options

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
| `connect()` | configures the UART port |
| `setPage(page)` | `page <n>` |
| `setText(component, value)` | `<comp>.txt="<value>"` - quotes/control chars stripped, `\\` and `\r` escapes encoded |
| `setNumber(component, value)` | `<comp>.val=<value>` |
| `setVisible(component, visible)` | `vis <comp>,<0/1>` |
| `setTextColor(component, color)` | `pco <comp>,<color>` (16-bit 565 RGB) |
| `setBackgroundColor(component, color)` | `bco <comp>,<color>` (16-bit 565 RGB) |
| `refresh(component)` | `ref <comp>` |
| `get(component, attribute?)` | `get <comp>.<attr>` (defaults to `.val`) - resolves with the reply |
| `getNumber(component)` | `get <comp>.val` parsed as a number (decimal or hex) |
| `sendRaw(instruction)` | any instruction not covered above, terminator appended |

### Static helpers

| Helper | Description |
|--------|-------------|
| `toBytes(text)` | UTF-8 encode text to `"0x.."` hex-string bytes |
| `bytesToAscii(bytes)` | decode `"0x.."` hex-string bytes back to text |
| `frameEnd()` | the mandatory `["0xFF", "0xFF", "0xFF"]` terminator |

## Reading Values

`get` is request/response - the panel answers with the value plus the
`0xFF 0xFF 0xFF` terminator, which the driver strips (any `bkcmd` ack bytes
after the terminator are ignored):

```typescript
const reply = await this.display.get("nTemp");        // get nTemp.val
const title = await this.display.get("tTitle", "txt"); // get tTitle.txt
const temp = await this.display.getNumber("nTemp");   // parsed: 25
```

The driver reads in short chunks until it sees the terminator, bounded by
`getTimeoutMs` (default 500 ms) and `getBufferSize` (default 64 bytes).
`get` **throws** instead of guessing: no reply (wrong component name,
wiring, or baud rate), a reply longer than `getBufferSize` without a
terminator (raise it for long `.txt` values), or the panel's `0x00` error
byte. `getNumber` parses both decimal replies and the hex replies some panel
firmwares send.

For data the panel pushes on its own, read the port directly with
`DEVICE.uartRead` and decode with the helper:

```typescript
const response = await this.env.DEVICE.uartRead(2, 64, 500);
if (response.type === "uart_read_result") {
  console.log(NextionDisplay.bytesToAscii(response.payload.data));
}
```

## Touch Events - Not Yet Supported

:::caution
Touch events are **not yet supported**. Receiving them requires an
event-driven UART receive path on the firmware (a `uart_monitor` command that
pushes incoming bytes as `uart_data` events into `onMessage`) - this is
planned Phase 2 work; the design lives in
[docs/designs/nextion-dev-experience.md](https://github.com/device-sdk/devicesdk/blob/main/docs/designs/nextion-dev-experience.md).
Until it lands, scripts that need touch input must poll `DEVICE.uartRead`
from a cron.
:::

The `devicesdk dev` simulator's UART panel can inject raw bytes into a port's
receive buffer (with a touch-frame preset), which lets you exercise
request/response logic and frame parsing without hardware - but on real
devices the panel's push-style touch frames have no event path yet.

## Example Project

[`examples/nextion-dashboard`](https://github.com/device-sdk/devicesdk/tree/main/examples/nextion-dashboard)
is a complete dashboard: ESP32 with UART2, updating `tTitle`, `tTime`,
`tTemp`, and `tUptime` text components on a cron.

## Troubleshooting

- **Garbage on the panel** - baud mismatch: the driver's `baudRate` differs
  from the panel's setting. Non-ASCII characters (e.g. `°`) also render as
  garbage - Nextion panels use their own font codepage, keep text ASCII.
- **No `comok` boot string on power-up** - check wiring (RX/TX crossed), a
  common ground, and that the panel is powered.
- **Component stays empty** - the Editor's component length limit is smaller
  than the value you sent; text is silently truncated by the panel.
- **`get` throws "no reply"** - wrong component name, wiring, or baud rate;
  the driver never guesses, it errors.
- **Missing touch events** - expected; see the touch callout above.

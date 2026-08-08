---
"@devicesdk/core": minor
"@devicesdk/simulation": minor
"@devicesdk/docs": minor
---

Add `NextionDisplay`, a device-script driver for ITEAD Nextion serial HMI displays.

Import it from the new `@devicesdk/core/nextion` subpath:

```ts
import { NextionDisplay } from "@devicesdk/core/nextion";

const display = new NextionDisplay(this.env.DEVICE, {
  port: 2, txPin: 17, rxPin: 16, baudRate: 115200,
});
await display.connect();
await display.setPage(0);
await display.setText("tTitle", "Hello");
await display.setNumber("nTemp", 215);
```

The driver handles the Nextion wire protocol (ASCII instructions terminated
by `0xFF 0xFF 0xFF`) over the existing `DEVICE.uart*` API: `setPage`,
`setText` (quotes/control chars stripped, `\\` and `\r` escapes encoded),
`setNumber`, `setVisible`, color setters, `refresh`, `get(component,
attribute?)` and `getNumber`. `get` reads in short chunks until the frame
terminator and **throws** on no reply, truncation, or panel error bytes -
it never returns an empty or truncated value silently - plus
`toBytes`/`bytesToAscii` helpers for raw reads. Touch events are **not yet
supported** - the reactive touch path needs an event-driven UART receive push
on the firmware and is planned as Phase 2 (see
`docs/designs/nextion-dev-experience.md`).

The `devicesdk dev` simulator gains a **UART injector panel**: per-port
receive buffers, hex-byte input with Nextion touch/get presets, and
hex+ASCII rendering of `uart_write`/`uart_read` in the event log, so
request/response exchanges can be exercised without hardware.

New docs: the [Using Nextion Displays](https://docs.devicesdk.com/guides/using-nextion/)
guide and a runnable `examples/nextion-dashboard` project.

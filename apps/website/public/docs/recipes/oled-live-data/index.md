---
title: "How do I show live data on a small OLED?"
description: "Wire an SSD1306 OLED, render text, update once a minute from a sensor read"
---

# How do I show live data on a small OLED?

> Wire an SSD1306 OLED, render text, update once a minute from a sensor read


Small SSD1306 OLEDs (128×64 or 128×32) are common, cheap, and run on I2C. The bundled `SSD1306` helper handles the init sequence and text rendering for you.

## Wiring

The OLED uses the same I2C pins as the [BME280 recipe](../read-bme280/) — both can share the bus.

| OLED | Pico W |
|---|---|
| VCC | 3V3 |
| GND | GND |
| SDA | GP0 |
| SCL | GP1 |

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "oled-display",
  devices: {
    main: {
      className: "OledDisplay",
      main: "./src/devices/main.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/main.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
import { SSD1306 } from "@devicesdk/core/i2c";
import { Pico } from "@devicesdk/core/devices/pico";

const display = new SSD1306({
  bus: 0,
  address: "0x3C", // some panels are at 0x3D — run i2cScan if unsure
  width: 128,
  height: 64,
});

export class OledDisplay extends DeviceEntrypoint {
  crons = { update: "* * * * *" };

  async onDeviceConnect() {
    await this.env.DEVICE.sendCommand(
      Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1 }),
    );
    await display.init(this.env.DEVICE);
    await display.text(this.env.DEVICE, "Booting...", { x: 0, y: 0 });
  }

  async onCron() {
    await this.env.DEVICE.getTemperature();
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "temperature_result") return;
    const c = message.payload.celsius;
    await display.clear(this.env.DEVICE);
    await display.text(this.env.DEVICE, "Temp", { x: 0, y: 0 });
    await display.text(this.env.DEVICE, `${c.toFixed(1)}°C`, { x: 0, y: 16, scale: 2 });
    await display.text(
      this.env.DEVICE,
      new Date().toISOString().slice(11, 16) + " UTC",
      { x: 0, y: 48 },
    );
  }
}
```

## What this demonstrates

- The `SSD1306` helper bundles the init sequence and a simple text-drawing API.
- Sharing the I2C bus with other sensors works fine — addresses are independent.
- Updating the screen on `temperature_result` keeps the redraws scheduled by the firmware ack, not a fragile script-side timer.

## Common gotchas

- **0.42" 72×40 panels.** These have a column offset of 28 in controller RAM. The `SSD1306` helper handles common offsets, but for non-standard glass sizes you may need to send `display_update` directly with a custom `columnOffset`.
- **Address scan.** If `init` looks like it succeeded but the screen is dark, run `await this.env.DEVICE.i2cScan(0)` once and check the address — some boards default to `0x3D`, not `0x3C`.

## Going further

- Combine with the [BME280 recipe](../read-bme280/) to display real humidity instead of the chip temperature.
- Use [`emitState`](/docs/concepts/emit-state/) so the dashboard mirrors what's on the OLED.


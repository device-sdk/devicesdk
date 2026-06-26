---
title: "How do I drive a WS2812 strip with a rainbow effect?"
description: "Configure the strip on the Pico's PIO, animate a slow hue shift via cron"
---

# How do I drive a WS2812 strip with a rainbow effect?

> Configure the strip on the Pico's PIO, animate a slow hue shift via cron


WS2812 (NeoPixel) strips are addressable RGB LEDs. On the Pico, DeviceSDK drives them through the PIO peripheral; on ESP32 boards, the firmware uses the led_strip component. The script-side API is the same.

## Wiring

| WS2812 | Pico W |
|---|---|
| VCC | 5V (VBUS) for short strips, external supply for >8 LEDs |
| GND | GND (shared with Pico GND if external supply) |
| DIN | GP2 |

Strips with more than ~8 LEDs draw too much current to power from VBUS — give them their own 5V supply and tie grounds together.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "rainbow-strip",
  devices: {
    strip: {
      className: "Rainbow",
      main: "./src/devices/strip.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/strip.ts`

```typescript
import { DeviceEntrypoint } from "@devicesdk/core";

const NUM_LEDS = 30;
const PIN = 2;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  // h: 0..360, s/v: 0..1
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export class Rainbow extends DeviceEntrypoint {
  // Update once a second — the hue offset advances each tick, the rainbow rolls.
  crons = { tick: "* * * * *" };

  async onDeviceConnect() {
    await this.env.DEVICE.pioWs2812Configure(PIN, NUM_LEDS);
    // Render once on boot so the strip lights even before the first cron.
    await this.render(0);
  }

  async onCron() {
    const offset = (await this.env.DEVICE.kv.get<number>("offset")) ?? 0;
    const next = (offset + 30) % 360; // shift 30° per tick
    await this.env.DEVICE.kv.put("offset", next);
    await this.render(next);
  }

  private async render(offset: number) {
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < NUM_LEDS; i++) {
      const hue = (offset + (i * 360) / NUM_LEDS) % 360;
      // Cap brightness at 0.2 so the strip doesn't blast eyes / draw too much current.
      pixels.push(hsvToRgb(hue, 1, 0.2));
    }
    await this.env.DEVICE.pioWs2812Update(pixels);
  }
}
```

## What this demonstrates

- `pioWs2812Configure` once per connect, `pioWs2812Update` per frame.
- A small HSV→RGB helper — agents that hallucinate `hsv()` etc. instead should be reminded that the script runs in a sandboxed runtime, no Node, no browser.
- `crons = { tick: "* * * * *" }` for a once-per-minute animation. Faster animations need to be driven by the firmware's PWM/PIO state machine; the script can only update at cron tick rates.
- Capping the brightness via the `v` channel (here 0.2) keeps the current draw and the literal wattage manageable.

## Going further

- Tie the rainbow speed to a dial or potentiometer read via ADC.
- Mirror state into a Home Assistant `light` entity — declare it under `ha.entities` in `devicesdk.ts`.


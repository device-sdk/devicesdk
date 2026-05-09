---
title: How do I toggle an LED with a button?
description: Wire a button to an input pin, watch transitions, drive the onboard LED
weight: 20
social_image: /og-images/docs/recipes/button-toggles-led.png
---

The smallest hardware-interactive recipe: press a button, the onboard LED toggles. Demonstrates GPIO input monitoring + GPIO output + a tiny piece of script-side state.

## Wiring (Pico W)

Wire one leg of a momentary button to **GP20**, the other leg to **GND**. The script enables the internal pull-up, so an unpressed button reads `high` and a pressed button reads `low`.

The LED is the onboard one — virtual pin 99, no wiring needed.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "button-led",
  devices: {
    main: {
      className: "ButtonToggle",
      main: "./src/devices/main.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/main.ts`

```typescript
import { DeviceEntrypoint, OnboardLED, type DeviceResponse } from "@devicesdk/core";

const BUTTON_PIN = 20;

export class ButtonToggle extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Subscribe to button presses with the internal pull-up enabled.
    await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true, "up");

    // Restore last LED state after a reboot.
    const last = await this.env.DEVICE.kv.get<"high" | "low">("led");
    await this.env.DEVICE.setGpioState(OnboardLED, last ?? "low");
  }

  async onMessage(message: DeviceResponse) {
    if (message.type !== "gpio_state_changed") return;
    if (message.payload.pin !== BUTTON_PIN) return;
    // Pull-up: pressed = "low", released = "high". React on press only.
    if (message.payload.state !== "low") return;

    const current = (await this.env.DEVICE.kv.get<"high" | "low">("led")) ?? "low";
    const next = current === "low" ? "high" : "low";
    await this.env.DEVICE.setGpioState(OnboardLED, next);
    await this.env.DEVICE.kv.put("led", next);
  }
}
```

## What this demonstrates

- `configureGpioInputMonitoring` for hardware-driven events (no polling).
- `OnboardLED` constant for portable LED code across Pico W, Pico 2 W, ESP32 variants.
- Persisting state with `this.env.DEVICE.kv` so a reboot doesn't reset the LED.
- Narrowing on `message.type === "gpio_state_changed"` in `onMessage`.

## Common gotchas

- **Switch bouncing.** A mechanical button can fire many `gpio_state_changed` events on a single press. If you see double-toggles, debounce in script: track the last-event timestamp in `kv` and ignore events within ~50 ms of the previous one.
- **Wrong pull direction.** If you wired the button between **3V3** and the pin (instead of GND), use `pull: "down"` and react on `state === "high"`.

## Going further

- Replace the LED with a relay for a real power switch. See the [Home Assistant recipe](../sensor-to-home-assistant/) to surface this as an HA `switch` entity.
- Drive a WS2812 strip color instead — see the [WS2812 recipe](../ws2812-rainbow/).

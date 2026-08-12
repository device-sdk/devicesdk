---
title: How do I read DS18B20 probes and a DHT sensor?
description: 1-Wire probe discovery by ROM code, DHT11/DHT22 temperature and humidity, both logged on a cron
sidebar:
  order: 15
---


The DS18B20 is the waterproof stainless-steel probe you use for a fridge, a boiler, or a fermenter: several of them share one GPIO, each answering to its own 64-bit ROM code. The DHT11/DHT22 is the cheap plastic block that gives you temperature *and* humidity from a single pin. This recipe wires up both, discovers the probes on connect, and logs every reading once a minute.

> The commands in this recipe need firmware **0.2.0 or newer**. When the server knows a device's firmware is older, they fail fast with a `firmware_incompatible` error telling you to reflash - see [Firmware version reporting](/concepts/device-api/#firmware-version-reporting).

## Wiring (Pico W)

| Sensor pin | Pico W pin |
|---|---|
| DS18B20 VDD (red) | 3V3 (pin 36) |
| DS18B20 GND (black) | GND (any) |
| DS18B20 DATA (yellow) | GP4 (pin 6) |
| DHT VCC | 3V3 (pin 36) |
| DHT GND | GND (any) |
| DHT DATA | GP15 (pin 20) |

The DS18B20 data line needs a **4.7 kOhm resistor between DATA and 3V3**. Without it the bus never releases and every search comes back empty - it is the single most common reason this recipe "doesn't work". Multiple probes all connect to the same three wires; you do not need one GPIO each. Most DHT breakout boards already include their own pull-up.

On an ESP32 the same code works: swap `deviceType` and pick any free GPIO. On the ESP32-C61 the 1-Wire bus uses the UART1 peripheral (that chip has no RMT), so leave UART port 1 unused there.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "probe-monitor",
  devices: {
    probes: {
      className: "ProbeMonitor",
      main: "./src/devices/probeMonitor.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/probeMonitor.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

const ONEWIRE_PIN = 4;
const DHT_PIN = 15;

export class ProbeMonitor extends DeviceEntrypoint {
  crons = { sample: "*/1 * * * *" }; // every minute UTC

  async onDeviceConnect() {
    // Walk the bus once and remember which probes are out there. Do this on
    // every connect, not once ever: probes get added, removed, and swapped.
    const reply = await this.env.DEVICE.onewireSearch(ONEWIRE_PIN);
    if (reply.type !== "onewire_search_result") {
      console.error("1-Wire search failed - check the 4.7k pull-up on GP4.");
      return;
    }

    const roms = reply.payload.roms;
    if (roms.length === 0) {
      console.error("No DS18B20 found on GP4.");
      return;
    }

    console.log(`Found ${roms.length} probe(s): ${roms.join(", ")}`);
    await this.env.DEVICE.kv.put("roms", roms);
  }

  async onCron() {
    const roms = (await this.env.DEVICE.kv.get<string[]>("roms")) ?? [];

    for (const rom of roms) {
      // Address one specific probe. Each read takes ~750 ms for the
      // conversion, so a handful of probes is fine on a one-minute cron.
      const reply = await this.env.DEVICE.onewireReadTemperature(
        ONEWIRE_PIN,
        rom,
      );
      if (reply.type !== "onewire_temp_result") continue;

      const { celsius } = reply.payload;
      console.log(`${rom}: ${celsius.toFixed(2)} C`);
      await this.env.DEVICE.emitState(`probe_${rom}`, celsius);
    }

    // The DHT returns both measurements in one command.
    const dht = await this.env.DEVICE.dhtRead(DHT_PIN, "dht22");
    if (dht.type === "dht_read_result") {
      const { celsius, humidity_pct } = dht.payload;
      console.log(`Room: ${celsius} C, ${humidity_pct}% RH`);
      await this.env.DEVICE.emitState("room_temperature", celsius);
      await this.env.DEVICE.emitState("room_humidity", humidity_pct);
    }
  }

  // Surface firmware-side failures instead of silently logging nothing.
  async onMessage(message: DeviceResponse) {
    if (message.type === "command_error") {
      console.error(`Sensor error: ${message.payload.error}`);
    }
  }
}
```

## One probe, no ROM code

If you only ever have a single DS18B20 on the bus, skip the search entirely and omit the `rom` argument - the firmware falls back to Skip ROM:

```typescript
const reply = await this.env.DEVICE.onewireReadTemperature(ONEWIRE_PIN);
```

This is shorter, but it breaks the moment a second probe joins the bus: both answer at once and the readings collide. Use the ROM code as soon as you have more than one.

## Using a DHT11 instead

The DHT11 speaks the same command with a different model string:

```typescript
const dht = await this.env.DEVICE.dhtRead(DHT_PIN, "dht11");
```

DHT11 reports whole degrees and whole percent, and its usable range is roughly 0-50 C / 20-90% RH. The DHT22 reports tenths, handles negative temperatures, and covers -40 to 80 C. Both are enforced to a **minimum of 2 seconds between reads on the same pin** by the firmware - ask sooner and the command fails, because the sensors return corrupt frames when polled faster.

## What this demonstrates

- Discovering 1-Wire devices by ROM code with `onewireSearch`, so several probes share one GPIO.
- Addressing an individual probe with `onewireReadTemperature(pin, rom)`.
- Reading temperature and humidity in one shot with `dhtRead(pin, model)`.
- Caching the discovered ROM codes in KV so `onCron` doesn't re-search every minute.
- Publishing each reading with `emitState` for dashboard watchers and Home Assistant.

## Going further

- Declare the entities in `devicesdk.ts` so they appear in Home Assistant - see the [HA recipe](/recipes/sensor-to-home-assistant/).
- Alert when a probe leaves a range - see the [Discord recipe](/recipes/post-discord-webhook/).
- Show live readings on an OLED - see the [OLED recipe](/recipes/oled-live-data/).
- Full method signatures live in the [Device API reference](/concepts/device-api/).

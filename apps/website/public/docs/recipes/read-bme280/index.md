---
title: "How do I read a BME280 temperature/humidity sensor on a Pico?"
description: "I2C-based BME280 driver — configure the bus, read the chip ID, log readings on a cron"
---

# How do I read a BME280 temperature/humidity sensor on a Pico?

> I2C-based BME280 driver — configure the bus, read the chip ID, log readings on a cron


The BME280 is a tiny Bosch sensor that reports temperature, humidity, and pressure over I2C. It's the standard sensor for indoor environment monitoring. This recipe configures the bus, confirms the sensor is wired correctly, and reads it on a cron.

## Wiring (Pico W)

| BME280 pin | Pico W pin |
|---|---|
| VCC | 3V3 (pin 36) |
| GND | GND (any) |
| SDA | GP0 (pin 1) |
| SCL | GP1 (pin 2) |

If your breakout has an `ADDR` jumper, leave it default (`0x76`); jumpered addresses appear as `0x77`.

## `devicesdk.ts`

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "bme280-monitor",
  devices: {
    sensor: {
      className: "EnvSensor",
      main: "./src/devices/envSensor.ts",
      deviceType: "pico-w",
      wifi: { ssid: "YOUR_WIFI_SSID", password: "YOUR_WIFI_PASSWORD" },
    },
  },
});
```

## `src/devices/envSensor.ts`

```typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
import { Pico } from "@devicesdk/core/devices/pico";

const I2C_BUS = 0;
const BME280_ADDR = "0x76";

export class EnvSensor extends DeviceEntrypoint {
  crons = { sample: "*/1 * * * *" }; // every minute UTC

  async onDeviceConnect() {
    // Configure the I2C bus once.
    await this.env.DEVICE.sendCommand(
      Pico.i2c({ bus: I2C_BUS, sda_pin: 0, scl_pin: 1 }),
    );

    // Verify the sensor is alive: read the chip-ID register (0xD0) — should be 0x60.
    const reply = await this.env.DEVICE.i2cRead(I2C_BUS, BME280_ADDR, 1, "0xD0");
    if (reply.type !== "i2c_read_result" || reply.payload.data[0] !== "0x60") {
      console.error(
        `BME280 not detected at ${BME280_ADDR}. Check wiring (SDA=GP0, SCL=GP1) and pull-ups.`,
      );
      return;
    }

    // Force-mode, x1 oversampling — see datasheet §3.4.
    await this.env.DEVICE.i2cBatchWrite ??
      undefined; // older runtimes used i2cBatchWrite; fall back to two writes.
    await this.env.DEVICE.i2cWrite(I2C_BUS, BME280_ADDR, ["0xF2", "0x01"]); // ctrl_hum
    await this.env.DEVICE.i2cWrite(I2C_BUS, BME280_ADDR, ["0xF4", "0x25"]); // ctrl_meas
    console.log("BME280 ready");
  }

  async onCron() {
    // Trigger a forced measurement (one-shot).
    await this.env.DEVICE.i2cWrite(I2C_BUS, BME280_ADDR, ["0xF4", "0x25"]);

    // Wait briefly for the conversion (datasheet table 9 worst-case ~10 ms).
    await new Promise((r) => setTimeout(r, 20));

    // Read 8 bytes starting at 0xF7: pressure (3), temp (3), humidity (2).
    const reply = await this.env.DEVICE.i2cRead(I2C_BUS, BME280_ADDR, 8, "0xF7");
    if (reply.type !== "i2c_read_result") return;

    // Parsing the calibration data and applying the BME280 compensation
    // formulas is omitted here — see the project repo for a full driver.
    // For demo purposes: log the raw bytes.
    console.log("BME280 raw:", reply.payload.data.join(" "));
  }

  // Surface command errors so we know if the sensor wandered off.
  async onMessage(message: DeviceResponse) {
    if (message.type === "command_error") {
      console.error(`I2C error: ${message.payload.error}`);
    }
  }
}
```

## What this demonstrates

- Configuring an I2C bus with `Pico.i2c({ ... })` for compile-time-validated pin pairs.
- Detecting an absent or mis-wired sensor via the chip-ID register before relying on it.
- A `crons` schedule firing `onCron` once a minute.
- Catching firmware-side I2C failures by handling `command_error` in `onMessage`.

## Going further

- Apply the BME280 compensation formulas to convert raw counts to °C, %, hPa. See the [datasheet §4.2](https://www.bosch-sensortec.com/products/environmental-sensors/humidity-sensors-bme280/).
- Persist the most recent reading with `this.env.DEVICE.kv.put("last", { temp, hum })` and read it on cold start.
- Forward to Home Assistant — see the [HA recipe](../sensor-to-home-assistant/).
- Forward to Discord — see the [Discord recipe](../post-discord-webhook/).


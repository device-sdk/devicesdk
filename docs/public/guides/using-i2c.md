---
title: Using I2C
description: Connect I2C sensors and displays — buses, addresses, byte format, batch writes
weight: 30
social_image: /og-images/docs/guides/using-i2c.png
---

I2C is the most common bus for hobbyist sensors and displays — temperature/humidity (BME280, SHT3x), accelerometers (LSM6DS3), OLEDs (SSD1306, SH1106), and so on. DeviceSDK exposes a small set of typed methods on `this.env.DEVICE` that cover every I2C use case.

## Configure the bus

Every Pico has two I2C buses (`0` and `1`); ESP32 chips have one or two depending on the variant. Configure the bus once at startup:

```typescript
import { Pico } from "@devicesdk/core/devices/pico";

await this.env.DEVICE.sendCommand(
  Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1 }), // GP0 = SDA, GP1 = SCL
);
```

`Pico.i2c` validates pin pairs at compile time — pass an invalid combination and TypeScript flags it before you deploy. See the [Pico pinout](/docs/hardware/pico-w/) for the full list of valid pin pairs per bus.

If you don't need typed validation, the lower-level `i2cConfigure` works on any board:

```typescript
await this.env.DEVICE.i2cConfigure(0, 0, 1, 100_000); // bus, sda, scl, hz
```

## Scan for devices

Before integrating a new sensor, confirm it shows up:

```typescript
async onDeviceConnect() {
  const result = await this.env.DEVICE.i2cScan(0);
  if (result.type === "i2c_scan_result") {
    console.log("Found:", result.payload.addresses_found);
    // → ["0x3C", "0x76"]   (OLED + BME280)
  }
}
```

## Read and write

I2C addresses are 7-bit hex strings (`"0x3C"`, `"0x76"`). Data is an array of single-byte hex strings — **one byte per array element**, do not pack:

```typescript
// Correct
await this.env.DEVICE.i2cWrite(0, "0x3C", ["0xAE", "0xD5"]);

// Wrong — sends two bytes packed as one element
await this.env.DEVICE.i2cWrite(0, "0x3C", ["0xAED5"]);
```

To read a register:

```typescript
const result = await this.env.DEVICE.i2cRead(0, "0x76", 1, "0xD0"); // BME280 chip ID
if (result.type === "i2c_read_result") {
  // result.payload.data === ["0x60"]  (BME280's chip ID)
}
```

## Batch writes

Configuration sequences (e.g. SSD1306 init, BME280 calibration setup) are usually 10–30 small writes. Use `i2cBatchWrite` to send them in one round-trip:

```typescript
await this.env.DEVICE.sendCommand({
  type: "i2c_batch_write",
  payload: {
    bus: 0,
    address: "0x3C",
    writes: [
      ["0xAE"],
      ["0xD5", "0x80"],
      ["0xA8", "0x3F"],
      // ...
    ],
  },
});
```

Or use the bundled `SSD1306` helper from `@devicesdk/core/i2c`, which wraps the init sequence and the framebuffer update:

```typescript
import { SSD1306 } from "@devicesdk/core/i2c";

const display = new SSD1306({ bus: 0, address: "0x3C", width: 128, height: 64 });
await display.init(this.env.DEVICE);
await display.text(this.env.DEVICE, "Hello, world", { x: 0, y: 0 });
```

## Common gotchas

- **Pull-up resistors.** I2C requires pull-ups (typically 4.7 kΩ) on SDA and SCL. Most sensor breakout boards include them; if you're hand-wiring, you must add them.
- **3.3V vs 5V.** Pico and ESP32 are 3.3V-only. A 5V sensor will work on the bus but the readings may be unstable; a 3.3V sensor on a 5V system can be damaged.
- **Address conflicts.** Two devices at the same address will both ack the bus and produce nonsense reads. `i2cScan` is the diagnostic — if you see the same address from two different sensors, you'll need to change one (most chips have an `ADDR` pin you can pull high or low).
- **OLED column offset.** 0.42" 72×40 SSD1306 panels start at column 28 in controller RAM, not column 0. Use the `columnOffset` field on `display_update` for those.

## Related

- [`SSD1306` helper](https://devicesdk.com/docs/recipes/oled-live-data/) — full OLED display recipe.
- [Read a BME280 sensor](https://devicesdk.com/docs/recipes/read-bme280/) — full temperature+humidity recipe.
- [Pico W pinout](/docs/hardware/pico-w/) — valid I2C pin combinations.

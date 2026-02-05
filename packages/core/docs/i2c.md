# I2C Guide

This guide covers how to use I2C devices with DeviceSDK.

## Overview

I2C (Inter-Integrated Circuit) is a two-wire protocol for communicating with sensors, displays, and other peripherals. DeviceSDK provides:

- **Low-level commands**: `i2c_configure`, `i2c_scan`, `i2c_write`, `i2c_read`, `i2c_batch_write`
- **High-level helpers**: `I2cDevice` base class for building device drivers
- **Built-in drivers**: `SSD1306` for OLED displays
- **Type-safe device helpers**: `Pico.i2c()` with autocomplete for valid pin combinations

## Pin Configuration

Before using I2C, you must configure the bus pins. The Pico has two I2C buses:

| Bus | Valid Pin Pairs (SDA/SCL) |
|-----|---------------------------|
| I2C0 | GP0/GP1, GP4/GP5, GP8/GP9, GP12/GP13, GP16/GP17, GP20/GP21 |
| I2C1 | GP2/GP3, GP6/GP7, GP10/GP11, GP14/GP15, GP18/GP19, GP26/GP27 |

### Configure I2C Bus (Type-Safe)

Use `Pico.i2c()` for full TypeScript autocomplete of valid pin combinations:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';
import { Pico } from '@devicesdk/core/devices/pico';

export class MyDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // TypeScript autocompletes valid pin combinations!
    await this.env.DEVICE.sendCommand(
      Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1, frequency: 400000 })
    );

    // This would be a type error - GP2/GP3 is not valid for I2C0:
    // Pico.i2c({ bus: 0, sda_pin: 2, scl_pin: 3 }) // Error!
  }
}
```

### Configure I2C Bus (Generic)

You can also use the raw command if you prefer:

```typescript
await this.env.DEVICE.sendCommand({
  type: 'i2c_configure',
  payload: {
    bus: 0,
    sda_pin: 0,
    scl_pin: 1,
    frequency: 400000
  }
});
```

## Scanning for Devices

Find all I2C devices connected to a bus:

```typescript
async onDeviceConnect() {
  // Configure bus first
  await this.env.DEVICE.sendCommand({
    type: 'i2c_configure',
    payload: { bus: 0, sda_pin: 0, scl_pin: 1 }
  });

  // Scan for devices
  const response = await this.env.DEVICE.i2cScan(0);

  if (response.type === 'i2c_scan_result') {
    console.log('Found devices:', response.payload.addresses_found);
    // Example output: ['0x3C', '0x68', '0x76']
  }
}
```

## Reading and Writing

### Single Write

```typescript
// Write bytes to device at address 0x3C
await this.env.DEVICE.i2cWrite(0, '0x3C', ['0x00', '0xAF']);
```

### Single Read

```typescript
// Read 2 bytes from register 0x75 on device 0x68
const response = await this.env.DEVICE.i2cRead(0, '0x68', 2, '0x75');

if (response.type === 'i2c_read_result') {
  console.log('Data:', response.payload.data);
  // Example output: ['0x71', '0x00']
}
```

### Read Without Register

```typescript
// Read 6 bytes directly (no register address)
const response = await this.env.DEVICE.i2cRead(0, '0x68', 6);
```

## Batch Operations

For devices requiring multiple writes (like sensor configuration), use batch operations to minimize network round-trips:

```typescript
// Send multiple writes in a single command
await this.env.DEVICE.sendCommand({
  type: 'i2c_batch_write',
  payload: {
    bus: 0,
    address: '0x76',
    writes: [
      ['0xF2', '0x01'],  // Config register 1
      ['0xF4', '0x27'],  // Config register 2
      ['0xF5', '0xA0']   // Config register 3
    ]
  }
});
```

## Building Custom Device Drivers

Use the `I2cDevice` base class to create reusable drivers:

```typescript
import { I2cDevice } from '@devicesdk/core/i2c';

class BME280 extends I2cDevice {
  constructor() {
    super({ bus: 0, address: '0x76' });
  }

  // Queue configuration writes
  configure(): this {
    this.queueWrite(['0xF2', '0x01']);  // Humidity oversampling x1
    this.queueWrite(['0xF4', '0x27']);  // Temp/pressure oversampling, normal mode
    this.queueWrite(['0xF5', '0xA0']);  // Standby 1000ms, filter off
    return this;
  }
}

// Usage in device entrypoint
export class MyDevice extends DeviceEntrypoint {
  private sensor = new BME280();

  async onDeviceConnect() {
    // Configure I2C bus
    await this.env.DEVICE.sendCommand({
      type: 'i2c_configure',
      payload: { bus: 0, sda_pin: 0, scl_pin: 1 }
    });

    // Send all sensor config in one batch
    await this.env.DEVICE.sendCommand(
      this.sensor.configure().toBatchCommand()
    );
  }
}
```

## Common I2C Devices

### OLED Displays (SSD1306/SH1106)

See [displays.md](./displays.md) for the full OLED guide.

```typescript
import { SSD1306 } from '@devicesdk/core/i2c';

const display = new SSD1306({ address: '0x3C', width: 128, height: 64 });
display.clear().drawText(0, 0, 'Hello!');
await this.env.DEVICE.sendCommand(display.toDisplayCommand({ init: true }));
```

### Common Device Addresses

| Device | Typical Address |
|--------|-----------------|
| SSD1306 OLED | 0x3C or 0x3D |
| SH1106 OLED | 0x3C or 0x3D |
| BME280 | 0x76 or 0x77 |
| BMP280 | 0x76 or 0x77 |
| MPU6050 | 0x68 or 0x69 |
| AHT20 | 0x38 |
| BH1750 | 0x23 or 0x5C |
| PCF8574 | 0x20-0x27 |

## Error Handling

I2C operations can fail. Always check for errors:

```typescript
try {
  await this.env.DEVICE.i2cWrite(0, '0x3C', ['0x00', '0xAF']);
} catch (error) {
  // Handle error - device not responding, bus not configured, etc.
}
```

Common errors:
- **Bus not configured**: Call `i2c_configure` first
- **Invalid pin combination**: Check pin mapping table above
- **NACK at address**: Device not present or wrong address
- **Bus busy**: Try resetting the bus or check wiring

## Tips

1. **Always configure the bus first** before any I2C operations
2. **Use 100kHz for long wires** - 400kHz may be unreliable over long distances
3. **Check pull-up resistors** - Most I2C devices need 4.7kΩ pull-ups on SDA/SCL
4. **Scan before using** - Verify your device is detected at the expected address
5. **Batch when possible** - Reduces latency for multi-register configurations

---
title: Using SPI
description: Communicate with SPI peripherals like displays, SD cards, and sensors
social_image: /og-images/docs/guides/using-spi.png
---

## What Is SPI?

SPI (Serial Peripheral Interface) is a synchronous, full-duplex communication bus commonly used to connect microcontrollers to peripherals like displays, SD cards, flash memory, and high-speed sensors. It uses four signals:

- **CLK** (Clock) -- the master drives the clock signal
- **MOSI** (Master Out, Slave In) -- data from the microcontroller to the peripheral
- **MISO** (Master In, Slave Out) -- data from the peripheral to the microcontroller
- **CS** (Chip Select) -- selects which peripheral to communicate with (active low)

### SPI vs I2C

| | SPI | I2C |
|---|-----|-----|
| Speed | Faster (up to tens of MHz) | Slower (100-400 kHz typical) |
| Wires | 4 + 1 CS per device | 2 (shared bus) |
| Devices | One CS pin per device | Up to 127 on one bus |
| Duplex | Full duplex | Half duplex |
| Use when | Speed matters (displays, SD cards) | Many slow sensors on one bus |

## Platform Support

| Platform | SPI Bus | Default Pins | Notes |
|----------|---------|-------------|-------|
| ESP32 | SPI3 (bus 0) | Configurable | SPI0/SPI1 reserved for flash |
| ESP32-C61 | SPI2 (bus 0) | Configurable | SPI0 reserved for flash |
| Pico W / Pico 2W | SPI0 (bus 0), SPI1 (bus 1) | Configurable | Any GPIO with SPI function |
| Simulator | bus 0 | Any | Returns mock responses |

## Pin Configuration

### Pico W / Pico 2W

SPI0 and SPI1 can be mapped to several GPIO pins. Common choices:

| Signal | SPI0 Pins | SPI1 Pins |
|--------|----------|----------|
| CLK | GP2, GP6, GP18 | GP10, GP14 |
| MOSI (TX) | GP3, GP7, GP19 | GP11, GP15 |
| MISO (RX) | GP0, GP4, GP16 | GP8, GP12 |
| CS | GP1, GP5, GP17 | GP9, GP13 |

### ESP32

SPI3 (VSPI) is the recommended bus for user peripherals. SPI0 and SPI1 are reserved for the internal flash chip.

| Signal | Typical Pins |
|--------|-------------|
| CLK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| CS | GPIO 5 |

Any available GPIO can be used -- these are just common defaults.

## SPI Modes

SPI has four operating modes based on clock polarity (CPOL) and clock phase (CPHA):

| Mode | CPOL | CPHA | Description |
|------|------|------|-------------|
| 0 | 0 | 0 | Clock idle low, data sampled on rising edge |
| 1 | 0 | 1 | Clock idle low, data sampled on falling edge |
| 2 | 1 | 0 | Clock idle high, data sampled on falling edge |
| 3 | 1 | 1 | Clock idle high, data sampled on rising edge |

Most peripherals use Mode 0. Check your peripheral's datasheet for the correct mode.

## TypeScript API

### Configure the SPI Bus

Before any communication, configure the bus with pin assignments, clock frequency, and mode:

```typescript
await this.env.DEVICE.spiConfigure(
  0,         // bus number
  18,        // CLK pin
  19,        // MOSI pin
  16,        // MISO pin
  17,        // CS pin
  1000000,   // frequency in Hz (1 MHz)
  0          // SPI mode (0-3)
);
```

### Full-Duplex Transfer

SPI is inherently full-duplex -- every byte sent simultaneously receives a byte back. Use `spiTransfer()` when you need to read the response:

```typescript
// Send 3 bytes and receive 3 bytes back simultaneously
const result = await this.env.DEVICE.spiTransfer(0, ['0x9F', '0x00', '0x00']);
if (result.type === 'spi_transfer_result') {
  console.log('Received:', result.payload.data);
}
```

### Write Only

When you do not need the response data, use `spiWrite()`:

```typescript
// Send a command to a display controller
await this.env.DEVICE.spiWrite(0, ['0x36', '0x00']);
```

### Read Only

Read a fixed number of bytes from the peripheral. The device sends clock pulses (with MOSI idle) to shift data in:

```typescript
const result = await this.env.DEVICE.spiRead(0, 4);
if (result.type === 'spi_read_result') {
  console.log('Read bytes:', result.payload.data);
}
```

## Example: Reading a Sensor Over SPI

This example reads the WHO_AM_I register from an accelerometer (common pattern for SPI sensors). Many SPI sensors use bit 7 of the first byte as a read/write flag -- setting bit 7 high means "read".

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const CLK_PIN = 18;
const MOSI_PIN = 19;
const MISO_PIN = 16;
const CS_PIN = 17;
const SPI_BUS = 0;

export default class SpiSensorDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Configure SPI at 1 MHz, Mode 0
    await this.env.DEVICE.spiConfigure(
      SPI_BUS, CLK_PIN, MOSI_PIN, MISO_PIN, CS_PIN, 1000000, 0
    );

    // Read WHO_AM_I register (0x0F with bit 7 set = 0x8F for read)
    const whoAmI = await this.env.DEVICE.spiTransfer(SPI_BUS, ['0x8F', '0x00']);
    if (whoAmI.type === 'spi_transfer_result') {
      // First byte is dummy (received while sending address), second byte is the value
      console.log('WHO_AM_I:', whoAmI.payload.data[1]);
    }

    // Read 6 bytes of acceleration data starting from register 0x28
    const accelData = await this.env.DEVICE.spiTransfer(
      SPI_BUS,
      ['0xE8', '0x00', '0x00', '0x00', '0x00', '0x00', '0x00']
      // 0xE8 = 0x28 | 0x80 (read) | 0x40 (auto-increment)
    );
    if (accelData.type === 'spi_transfer_result') {
      const bytes = accelData.payload.data;
      console.log('Accel raw bytes:', bytes.slice(1)); // skip dummy first byte
    }
  }
}
```

## CLI Inspect Commands

Use `devicesdk inspect <device-id>` to test SPI interactively:

```
spi configure <bus> <clk> <mosi> <miso> <cs> <freq> [mode]
spi transfer <bus> <hex_bytes...>
spi write <bus> <hex_bytes...>
spi read <bus> <bytes>
```

Examples:

```
> spi configure 0 18 19 16 17 1000000 0
OK
> spi transfer 0 0x8F 0x00
SPI transfer on bus 0: [0x00, 0x33]
> spi write 0 0x20 0x47
OK
> spi read 0 4
SPI read from bus 0: [0x12, 0x34, 0x56, 0x78]
```

## Tips

- Always configure the bus before any read/write operations.
- SPI has no built-in device addressing -- use separate CS pins for multiple peripherals on the same bus.
- Check your peripheral's maximum clock speed. Starting at 1 MHz is a safe default.
- Data bytes are hex strings prefixed with `0x` (e.g., `'0xFF'`).
- The first byte received in a `spiTransfer()` is usually a dummy byte (received while the address byte was being sent).

## Next Steps

- [Hardware Compatibility](/docs/resources/hardware/) -- full feature availability table
- [Using UART](/docs/guides/using-uart/) -- serial communication with GPS, Bluetooth, and other modules
- [Using I2C](/docs/resources/hardware/#i2c) -- slower bus for sensors with simpler wiring

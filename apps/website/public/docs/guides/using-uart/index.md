---
title: "Using UART"
description: "Serial communication with GPS modules, Bluetooth adapters, and other peripherals"
url: http://localhost:1313/docs/guides/using-uart/
---

# Using UART

> Serial communication with GPS modules, Bluetooth adapters, and other peripherals


## What Is UART?

UART (Universal Asynchronous Receiver/Transmitter) is a serial communication protocol used to exchange data between a microcontroller and external modules like GPS receivers, Bluetooth adapters, RS-485 transceivers, and other serial devices. Unlike SPI and I2C, UART is asynchronous -- there is no shared clock signal. Both sides must agree on the same baud rate (speed) ahead of time.

UART uses two data lines:

- **TX** (Transmit) -- data output from the microcontroller
- **RX** (Receive) -- data input to the microcontroller

The TX of one device connects to the RX of the other, and vice versa (crossed connection).

## Platform Support

| Platform | Ports | Restrictions |
|----------|-------|-------------|
| ESP32 | UART0, UART1, UART2 | UART0 reserved for debug console |
| ESP32-C61 | UART0, UART1 | UART0 reserved for debug console |
| Pico W / Pico 2W | UART0 (port 0), UART1 (port 1) | Both available |
| Simulator | port 0 | Returns mock responses |

On ESP32 boards, UART0 is connected to the USB-to-serial converter used for flashing and debug output. Use UART1 or UART2 for external peripherals.

## Pin Configuration

### Pico W / Pico 2W

| Signal | UART0 Pins | UART1 Pins |
|--------|-----------|-----------|
| TX | GP0, GP12, GP16 | GP4, GP8 |
| RX | GP1, GP13, GP17 | GP5, GP9 |

### ESP32

Any available GPIO can be assigned to UART1 and UART2. Common defaults:

| Signal | UART1 | UART2 |
|--------|-------|-------|
| TX | GPIO 10 | GPIO 17 |
| RX | GPIO 9 | GPIO 16 |

### ESP32-C61

| Signal | UART1 |
|--------|-------|
| TX | Any available GPIO |
| RX | Any available GPIO |

## Communication Parameters

UART communication is defined by several parameters. Both sides must match:

- **Baud rate** -- bits per second. Common values: 9600, 19200, 38400, 57600, 115200
- **Data bits** -- bits per character (5, 6, 7, or 8). Default: 8
- **Stop bits** -- 1 or 2. Default: 1
- **Parity** -- error checking bit: `"none"`, `"even"`, or `"odd"`. Default: `"none"`

The most common configuration is **9600 8N1** (9600 baud, 8 data bits, no parity, 1 stop bit) or **115200 8N1** for faster peripherals.

## TypeScript API

### Configure a UART Port

Set pin assignments, baud rate, and optional framing parameters:

```typescript
// Basic configuration: 9600 baud on port 1
await this.env.DEVICE.uartConfigure(1, 4, 5, 9600);

// Full configuration with all parameters
await this.env.DEVICE.uartConfigure(
  1,        // port number
  4,        // TX pin
  5,        // RX pin
  115200,   // baud rate
  8,        // data bits (5, 6, 7, or 8)
  1,        // stop bits (1 or 2)
  'none'    // parity ('none', 'even', or 'odd')
);
```

### Write Data

Send bytes to the UART peripheral. Data values are hex strings:

```typescript
// Send the ASCII string "AT\r\n" to an AT-command device
await this.env.DEVICE.uartWrite(1, ['0x41', '0x54', '0x0D', '0x0A']);

// Send raw bytes
await this.env.DEVICE.uartWrite(1, ['0xFF', '0x01', '0x86']);
```

### Read Data

Read bytes from the UART receive buffer. Specify the maximum number of bytes to read and an optional timeout in milliseconds:

```typescript
// Read up to 64 bytes, wait up to 2 seconds for data
const result = await this.env.DEVICE.uartRead(1, 64, 2000);
if (result.type === 'uart_read_result') {
  console.log(`Read ${result.payload.bytes_read} bytes:`, result.payload.data);
}
```

If `timeoutMs` is omitted, the read returns immediately with whatever data is available in the buffer.

## Example: Reading GPS Data Over UART

GPS modules (like the NEO-6M) output NMEA sentences over UART at 9600 baud. This example reads GPS data and extracts the position.

```typescript
import { DeviceEntrypoint, type DeviceResponse } from '@devicesdk/core';

const GPS_TX_PIN = 4;  // Microcontroller TX -> GPS RX (if needed)
const GPS_RX_PIN = 5;  // GPS TX -> Microcontroller RX
const GPS_PORT = 1;

export default class GpsDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // GPS modules typically communicate at 9600 baud
    await this.env.DEVICE.uartConfigure(GPS_PORT, GPS_TX_PIN, GPS_RX_PIN, 9600);

    // Read GPS data in a loop
    for (let i = 0; i < 60; i++) {
      const result = await this.env.DEVICE.uartRead(GPS_PORT, 256, 1000);
      if (result.type === 'uart_read_result' && result.payload.bytes_read > 0) {
        const text = hexToAscii(result.payload.data);
        const lines = text.split('\r\n');

        for (const line of lines) {
          // $GPGGA contains position fix data
          if (line.startsWith('$GPGGA')) {
            console.log('GPS fix:', line);
            await this.env.DEVICE.persistLog('info', `GPS: ${line}`);
          }
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

function hexToAscii(hexBytes: string[]): string {
  return hexBytes
    .map(h => String.fromCharCode(parseInt(h, 16)))
    .join('');
}
```

## Example: Sending AT Commands

Many peripherals (Bluetooth modules, WiFi modules, cellular modems) use AT commands over UART:

```typescript
import { DeviceEntrypoint } from '@devicesdk/core';

export default class AtCommandDevice extends DeviceEntrypoint {
  async onDeviceConnect() {
    // Configure UART at 115200 baud for a Bluetooth module
    await this.env.DEVICE.uartConfigure(1, 4, 5, 115200);

    // Send AT command to check module is responsive
    const response = await this.sendAt('AT');
    console.log('Module response:', response);

    // Query module firmware version
    const version = await this.sendAt('AT+VERSION');
    console.log('Firmware:', version);
  }

  async sendAt(command: string): Promise<string> {
    // Convert command + CRLF to hex bytes
    const bytes = `${command}\r\n`.split('').map(
      c => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')
    );
    await this.env.DEVICE.uartWrite(1, bytes);

    // Wait for response
    const result = await this.env.DEVICE.uartRead(1, 128, 2000);
    if (result.type === 'uart_read_result') {
      return result.payload.data
        .map(h => String.fromCharCode(parseInt(h, 16)))
        .join('');
    }
    return '';
  }
}
```

## CLI Inspect Commands

Use `devicesdk inspect <device-id>` to test UART interactively:

```
uart configure <port> <tx> <rx> <baud> [data_bits] [stop_bits] [parity]
uart write <port> <hex_bytes...>
uart read <port> <bytes> [timeout_ms]
```

Examples:

```
> uart configure 1 4 5 9600
OK
> uart write 1 0x41 0x54 0x0D 0x0A
OK
> uart read 1 64 2000
UART port 1 read 4 bytes: [0x4F, 0x4B, 0x0D, 0x0A]
```

## Tips

- Always configure the port before reading or writing.
- Cross the TX/RX connections: your TX pin connects to the peripheral's RX, and vice versa.
- Match baud rates exactly. A mismatch produces garbled data.
- GPS modules may take 30-60 seconds to acquire a satellite fix after power-on. The module will still output NMEA sentences during this time, but position fields will be empty.
- On ESP32, avoid using UART0 (port 0) for peripherals -- it is wired to the USB debug console.
- Data bytes are hex strings prefixed with `0x` (e.g., `'0x41'` for ASCII 'A').
- When reading, the `bytes_read` field in the response indicates how many bytes were actually received (may be less than `bytesToRead`).

## Next Steps

- [Hardware Compatibility](/docs/hardware/) -- full feature availability table
- [Using SPI](/docs/guides/using-spi/) -- faster bus for displays and SD cards
- [Addressable LEDs](/docs/guides/addressable-leds/) -- drive WS2812/NeoPixel LED strips


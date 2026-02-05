# Device Firmware I2C Implementation Guide

This document specifies the I2C commands that the device firmware must implement. These commands are sent from the cloud to the device via WebSocket.

## Overview

All commands follow this structure:
```json
{
  "id": "unique-command-id",
  "type": "command_type",
  "payload": { ... }
}
```

All responses follow this structure:
```json
{
  "id": "same-id-as-command",
  "type": "response_type",
  "payload": { ... }
}
```

## I2C Bus Configuration

The Pico has two I2C peripherals (I2C0 and I2C1). Pins must be configured by the user before using I2C commands.

**Valid I2C pin mappings:**
- **I2C0**: GP0/GP1, GP4/GP5, GP8/GP9, GP12/GP13, GP16/GP17, GP20/GP21
- **I2C1**: GP2/GP3, GP6/GP7, GP10/GP11, GP14/GP15, GP18/GP19, GP26/GP27

---

### `i2c_configure` - Configure I2C Bus Pins

Configures the pins for an I2C bus. Must be called before any other I2C commands on that bus.

**Command:**
```json
{
  "id": "cmd-100",
  "type": "i2c_configure",
  "payload": {
    "bus": 0,
    "sda_pin": 0,
    "scl_pin": 1,
    "frequency": 400000
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number (0 or 1) |
| `sda_pin` | number | GPIO pin for SDA |
| `scl_pin` | number | GPIO pin for SCL |
| `frequency` | number? | Bus frequency in Hz (default: 100000). Common values: 100000 (standard), 400000 (fast) |

**Firmware Action:**
1. Validate that the pin combination is valid for the specified bus
2. Deinitialize the bus if already configured
3. Initialize I2C peripheral with specified pins and frequency
4. Store configuration for later use

**Response (success):**
```json
{
  "id": "cmd-100",
  "type": "command_ack",
  "payload": {
    "command_type": "i2c_configure"
  }
}
```

**Response (error):**
```json
{
  "id": "cmd-100",
  "type": "command_error",
  "payload": {
    "command_type": "i2c_configure",
    "error": "Invalid pin combination: GP0/GP1 not valid for I2C1"
  }
}
```

---

## Commands

### 1. `i2c_scan` - Scan I2C Bus

Scans the I2C bus to detect connected devices.

**Command:**
```json
{
  "id": "cmd-123",
  "type": "i2c_scan",
  "payload": {
    "bus": 0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number (0 or 1) |

**Firmware Action:**
1. Initialize the specified I2C bus if not already initialized
2. For each address from 0x08 to 0x77:
   - Attempt a zero-byte write
   - If ACK received, device is present at that address
3. Collect all responding addresses

**Response:**
```json
{
  "id": "cmd-123",
  "type": "i2c_scan_result",
  "payload": {
    "bus": 0,
    "addresses_found": ["0x3C", "0x68", "0x76"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | The bus that was scanned |
| `addresses_found` | string[] | Hex addresses of detected devices |

---

### 2. `i2c_write` - Single I2C Write

Writes bytes to an I2C device.

**Command:**
```json
{
  "id": "cmd-124",
  "type": "i2c_write",
  "payload": {
    "bus": 0,
    "address": "0x3C",
    "data": ["0x00", "0xAE"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number |
| `address` | string | Device address in hex (e.g., "0x3C") |
| `data` | string[] | Bytes to write in hex format |

**Firmware Action:**
1. Parse address from hex string to integer
2. Parse each data byte from hex string to integer
3. Perform I2C write transaction:
   - Send START condition
   - Send address byte with write bit
   - Send all data bytes
   - Send STOP condition

**Response (success):**
```json
{
  "id": "cmd-124",
  "type": "command_ack",
  "payload": {
    "command_type": "i2c_write"
  }
}
```

**Response (error):**
```json
{
  "id": "cmd-124",
  "type": "command_error",
  "payload": {
    "command_type": "i2c_write",
    "error": "NACK received at address 0x3C"
  }
}
```

---

### 3. `i2c_read` - Single I2C Read

Reads bytes from an I2C device, optionally writing a register address first.

**Command:**
```json
{
  "id": "cmd-125",
  "type": "i2c_read",
  "payload": {
    "bus": 0,
    "address": "0x68",
    "register_to_read": "0x75",
    "bytes_to_read": 1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number |
| `address` | string | Device address in hex |
| `register_to_read` | string? | Optional register address to write before reading |
| `bytes_to_read` | number | Number of bytes to read |

**Firmware Action:**
1. If `register_to_read` is provided:
   - Perform write transaction with register address (no STOP)
   - Perform repeated START
2. Perform read transaction:
   - Send address byte with read bit
   - Read `bytes_to_read` bytes, sending ACK for all but last byte
   - Send NACK for last byte
   - Send STOP condition

**Response:**
```json
{
  "id": "cmd-125",
  "type": "i2c_read_result",
  "payload": {
    "bus": 0,
    "address": "0x68",
    "data": ["0x71"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | The bus used |
| `address` | string | The device address |
| `data` | string[] | Read bytes in hex format |

---

### 4. `i2c_batch_write` - Batched I2C Writes

Performs multiple I2C write operations in sequence. This reduces network round-trips for devices that require multiple configuration writes.

**Command:**
```json
{
  "id": "cmd-126",
  "type": "i2c_batch_write",
  "payload": {
    "bus": 0,
    "address": "0x76",
    "writes": [
      ["0xF2", "0x01"],
      ["0xF4", "0x27"],
      ["0xF5", "0xA0"]
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number |
| `address` | string | Device address in hex |
| `writes` | string[][] | Array of write operations, each is array of hex bytes |

**Firmware Action:**
1. For each write operation in `writes` array:
   - Parse bytes from hex strings
   - Perform complete I2C write transaction (START, address, data, STOP)
   - If any write fails, stop and return error
2. All writes use the same bus and address

**Response (success):**
```json
{
  "id": "cmd-126",
  "type": "command_ack",
  "payload": {
    "command_type": "i2c_batch_write"
  }
}
```

**Response (error):**
```json
{
  "id": "cmd-126",
  "type": "command_error",
  "payload": {
    "command_type": "i2c_batch_write",
    "error": "Write 2 failed: NACK received"
  }
}
```

---

### 5. `display_update` - OLED Display Update

Updates an OLED display with a complete framebuffer. Optimized for displays like SSD1306/SH1106.

**Command:**
```json
{
  "id": "cmd-127",
  "type": "display_update",
  "payload": {
    "bus": 0,
    "address": "0x3C",
    "controller": "ssd1306",
    "width": 128,
    "height": 64,
    "init": true,
    "buffer": "AAAAAAAAAA...base64..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `bus` | number | I2C bus number |
| `address` | string | Display I2C address (usually "0x3C" or "0x3D") |
| `controller` | string | Display controller type: "ssd1306" or "sh1106" |
| `width` | number | Display width in pixels (e.g., 128) |
| `height` | number | Display height in pixels (e.g., 64 or 32) |
| `init` | boolean? | If true, send initialization sequence before buffer |
| `buffer` | string | Base64-encoded framebuffer data |

**Buffer Format:**
- Size: `width * height / 8` bytes (1024 bytes for 128x64, 512 bytes for 128x32)
- Organization: Page-based, 8 vertical pixels per byte
- Each byte represents a vertical column of 8 pixels (bit 0 = top pixel)
- Pages are arranged top-to-bottom, columns left-to-right within each page

**Firmware Action:**

#### Step 1: Decode Buffer
```
decoded_buffer = base64_decode(payload.buffer)
expected_size = width * height / 8
assert(decoded_buffer.length == expected_size)
```

#### Step 2: Initialize Display (if `init` is true)

For SSD1306:
```
// All commands are sent with control byte 0x00 prefix
i2c_write(address, [0x00, 0xAE])        // Display OFF
i2c_write(address, [0x00, 0xD5, 0x80])  // Set clock divide ratio
i2c_write(address, [0x00, 0xA8, height-1]) // Set multiplex ratio
i2c_write(address, [0x00, 0xD3, 0x00])  // Set display offset = 0
i2c_write(address, [0x00, 0x40])        // Set start line = 0
i2c_write(address, [0x00, 0x8D, 0x14])  // Enable charge pump
i2c_write(address, [0x00, 0x20, 0x00])  // Horizontal addressing mode
i2c_write(address, [0x00, 0xA1])        // Segment remap (flip horizontal)
i2c_write(address, [0x00, 0xC8])        // COM scan direction (flip vertical)

// Set COM pins based on height
if (height == 64):
    i2c_write(address, [0x00, 0xDA, 0x12])
else if (height == 32):
    i2c_write(address, [0x00, 0xDA, 0x02])

i2c_write(address, [0x00, 0x81, 0xCF])  // Set contrast
i2c_write(address, [0x00, 0xD9, 0xF1])  // Set pre-charge period
i2c_write(address, [0x00, 0xDB, 0x40])  // Set VCOMH deselect level
i2c_write(address, [0x00, 0xA4])        // Display from RAM
i2c_write(address, [0x00, 0xA6])        // Normal display (not inverted)
i2c_write(address, [0x00, 0xAF])        // Display ON
```

For SH1106 (differences from SSD1306):
```
// SH1106 uses page addressing mode and has 132-column internal RAM
// Column offset of 2 is typically needed for 128-pixel displays
i2c_write(address, [0x00, 0x20])        // Page addressing mode (different from SSD1306)
// When writing data, add column offset of 2
```

#### Step 3: Set Display Window

For SSD1306 (horizontal addressing mode):
```
i2c_write(address, [0x00, 0x21, 0x00, width-1])   // Column address range
i2c_write(address, [0x00, 0x22, 0x00, (height/8)-1]) // Page address range
```

For SH1106 (page addressing mode):
```
// Must set page and column for each page when writing
for page in 0..(height/8):
    i2c_write(address, [0x00, 0xB0 + page])     // Set page
    i2c_write(address, [0x00, 0x02])            // Set lower column (offset 2)
    i2c_write(address, [0x00, 0x10])            // Set upper column
    // Then write page data...
```

#### Step 4: Write Framebuffer Data

Data bytes are prefixed with control byte 0x40 (indicates data, not command).

For SSD1306 (can send entire buffer at once in horizontal mode):
```
// Prepend 0x40 control byte, then send all buffer data
i2c_write(address, [0x40] + decoded_buffer)
```

For SH1106 (must write page by page):
```
for page in 0..(height/8):
    page_start = page * width
    page_data = decoded_buffer[page_start : page_start + width]

    // Set page address
    i2c_write(address, [0x00, 0xB0 + page])
    i2c_write(address, [0x00, 0x02])  // Lower column + offset
    i2c_write(address, [0x00, 0x10])  // Upper column

    // Write page data
    i2c_write(address, [0x40] + page_data)
```

**Note on I2C Buffer Size:**
The Pico's I2C hardware typically has a buffer limit. If `width` is 128 bytes and adding the control byte, you may need to split the write:
```
// Option A: Write in chunks of ~128 bytes
// Option B: Use DMA for large transfers
// Option C: Write column by column (slowest)
```

**Response (success):**
```json
{
  "id": "cmd-127",
  "type": "command_ack",
  "payload": {
    "command_type": "display_update"
  }
}
```

**Response (error):**
```json
{
  "id": "cmd-127",
  "type": "command_error",
  "payload": {
    "command_type": "display_update",
    "error": "Display not responding at 0x3C"
  }
}
```

---

## Error Handling

Common I2C errors the firmware should detect and report:

| Error | Description |
|-------|-------------|
| `Bus not configured` | I2C bus must be configured with `i2c_configure` first |
| `Invalid pin combination` | SDA/SCL pins not valid for the specified bus |
| `NACK at address` | Device did not acknowledge its address |
| `NACK at data` | Device did not acknowledge a data byte |
| `Bus busy` | I2C bus is held low (possible stuck device) |
| `Timeout` | Transaction took too long |
| `Invalid bus` | Requested bus number doesn't exist (must be 0 or 1) |
| `Invalid address` | Address outside valid range (0x08-0x77) |

---

## Implementation Checklist

- [ ] `i2c_configure` command handler
  - [ ] Pin validation for bus/pin combinations
  - [ ] I2C peripheral initialization with frequency
  - [ ] Store bus configuration state
- [ ] `i2c_scan` command handler
- [ ] `i2c_write` command handler
- [ ] `i2c_read` command handler
- [ ] `i2c_batch_write` command handler
- [ ] `display_update` command handler
  - [ ] Base64 decoding
  - [ ] SSD1306 init sequence
  - [ ] SH1106 init sequence (with column offset)
  - [ ] Framebuffer write (handle buffer size limits)
- [ ] Error response generation (bus not configured, invalid pins, etc.)
- [ ] Hex string parsing utilities

---

## Testing

### Test 1: I2C Scan
1. Connect an I2C device (e.g., OLED at 0x3C)
2. Send `i2c_scan` command
3. Verify device address appears in response

### Test 2: OLED Display
1. Connect SSD1306 OLED to I2C bus 0
2. Send `display_update` with `init: true` and a test pattern buffer
3. Verify display shows the pattern

### Test 3: Batch Write
1. Connect a sensor (e.g., BME280 at 0x76)
2. Send `i2c_batch_write` with configuration registers
3. Read back configuration to verify writes succeeded

---

## Reference: Base64 Decoding

If your firmware doesn't have base64 decoding, here's a simple implementation:

```c
static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

int b64_decode_char(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1; // '=' or invalid
}

size_t b64_decode(const char* input, size_t input_len, uint8_t* output) {
    size_t out_idx = 0;
    for (size_t i = 0; i < input_len; i += 4) {
        int a = b64_decode_char(input[i]);
        int b = b64_decode_char(input[i + 1]);
        int c = b64_decode_char(input[i + 2]);
        int d = b64_decode_char(input[i + 3]);

        output[out_idx++] = (a << 2) | (b >> 4);
        if (input[i + 2] != '=')
            output[out_idx++] = ((b & 0x0F) << 4) | (c >> 2);
        if (input[i + 3] != '=')
            output[out_idx++] = ((c & 0x03) << 6) | d;
    }
    return out_idx;
}
```

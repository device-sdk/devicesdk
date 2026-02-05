# ESP32 API Changes Required

This document describes the changes needed on the DeviceSDK API to support ESP32 device flashing.

## Endpoint

```
POST /v1/projects/{projectId}/devices/{deviceId}/firmware
```

This is the existing firmware endpoint. The changes are in how it handles `device_type: "esp32"`.

---

## Request

The request body remains the same structure, but now accepts `esp32` as a valid device type:

```json
{
  "ssid": "string",
  "pass": "string",
  "device_type": "esp32" | "pico-w" | "pico2-w",
  "host": "string (optional)"
}
```

---

## Response Changes

The API must return different response formats based on the `device_type`:

### For ESP32 (`device_type: "esp32"`)

**Content-Type:** `application/zip`

**Body:** ZIP archive containing firmware files and flash configuration.

#### ZIP Archive Structure

```
firmware.zip
├── flasher_args.json      # Flash configuration (required)
├── bootloader.bin         # Bootloader binary (~26KB, flash at 0x1000)
├── partition-table.bin    # Partition table (~3KB, flash at 0x8000)
└── app.bin                # Main application (flash at 0x10000)
```

#### flasher_args.json Schema

```json
{
  "chip": "esp32",
  "flash_mode": "dio",
  "flash_size": "2MB",
  "flash_freq": "40m",
  "before": "default_reset",
  "after": "hard_reset",
  "flash_files": {
    "0x1000": "bootloader.bin",
    "0x8000": "partition-table.bin",
    "0x10000": "app.bin"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `chip` | string | ESP chip variant (e.g., `esp32`, `esp32s3`, `esp32c3`) |
| `flash_mode` | string | SPI flash mode (`dio`, `qio`, `dout`, `qout`) |
| `flash_size` | string | Flash size (`2MB`, `4MB`, `8MB`, `16MB`) |
| `flash_freq` | string | Flash frequency (`40m`, `80m`) |
| `before` | string | Reset mode before flashing (`default_reset`, `no_reset`) |
| `after` | string | Reset mode after flashing (`hard_reset`, `soft_reset`, `no_reset`) |
| `flash_files` | object | Map of flash addresses (hex strings) to filenames |

### For Pico (`device_type: "pico-w"` or `"pico2-w"`)

**No changes** - continues to return:

**Content-Type:** `application/octet-stream`

**Body:** UF2 binary file

---

## Implementation Notes

### 1. Content-Type Detection

The CLI determines the firmware type by the `device_type` in the config, not by inspecting the response. However, setting the correct `Content-Type` header is recommended:

- ESP32: `application/zip`
- Pico: `application/octet-stream`

### 2. Flash Address Format

Flash addresses in `flash_files` must be hex strings with `0x` prefix (e.g., `"0x1000"`). The CLI passes these directly to esptool.

### 3. Binary File Requirements

All `.bin` files referenced in `flash_files` must be present in the ZIP archive root. The CLI validates this and fails with a clear error if any are missing.

### 4. Future ESP32 Variants

The `flasher_args.json` format supports future ESP32 variants (S3, C3, C6) by allowing different:
- `chip` values
- Flash addresses in `flash_files`
- Flash configuration parameters

Example for ESP32-S3:
```json
{
  "chip": "esp32s3",
  "flash_mode": "dio",
  "flash_size": "8MB",
  "flash_freq": "80m",
  "before": "default_reset",
  "after": "hard_reset",
  "flash_files": {
    "0x0": "bootloader.bin",
    "0x8000": "partition-table.bin",
    "0x10000": "app.bin"
  }
}
```

### 5. Error Responses

Error responses should remain unchanged (JSON with `error.message`):

```json
{
  "success": false,
  "error": {
    "message": "Invalid device type",
    "code": "INVALID_DEVICE_TYPE"
  }
}
```

---

## Validation Checklist

- [ ] Accept `esp32` as valid `device_type`
- [ ] Return ZIP archive with correct structure for ESP32
- [ ] Include valid `flasher_args.json` with all required fields
- [ ] Include all binary files referenced in `flash_files`
- [ ] Set `Content-Type: application/zip` for ESP32 responses
- [ ] Continue returning UF2 for Pico device types (no regression)

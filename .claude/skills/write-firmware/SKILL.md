---
name: write-firmware
description: Use when creating or modifying firmware code in firmware/pico/ or firmware/esp32/. Covers HAL abstraction, pin validation, command handlers, WebSocket protocol, I2C bus config, and CMake builds.
---

# Write Firmware

## HAL Abstraction Layer

The Hardware Abstraction Layer (`firmware/pico/src/hal.h`) provides a platform-agnostic interface. All hardware access goes through HAL functions — never call platform APIs directly from command handlers.

### GPIO

```c
void hal_set_gpio(uint8_t pin, gpio_state_t state);       // HIGH or LOW
bool hal_get_gpio_digital(uint8_t pin);                     // Digital read
uint16_t hal_get_gpio_analog(uint8_t pin);                  // ADC read (12-bit)
void hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull); // PULL_UP, PULL_DOWN, PULL_NONE
```

### PWM

```c
void hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle); // duty 0.0-1.0
```

### I2C

```c
void hal_i2c_init(uint8_t bus);                             // Initialize bus
i2c_scan_result_t hal_i2c_scan(uint8_t bus);                // Scan for devices
bool hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t* data, size_t len);
int hal_i2c_read(uint8_t bus, uint8_t address, uint8_t* buffer, size_t len, int reg);
bool hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency);
```

### System

```c
void hal_init();
void hal_reboot();
void hal_blink_led(uint32_t duration_ms);
```

## Pin Validation (RP2040)

### ADC Pins

Only GPIO 26-29 support analog input:
- Pin 26: ADC0
- Pin 27: ADC1
- Pin 28: ADC2
- Pin 29: ADC3 (internal temperature sensor)

### I2C Pin Combinations

RP2040 has specific valid SDA/SCL pin pairs per I2C bus:

| Bus | Valid SDA Pins | Valid SCL Pins |
|-----|---------------|---------------|
| I2C0 | 0, 4, 8, 12, 16, 20 | 1, 5, 9, 13, 17, 21 |
| I2C1 | 2, 6, 10, 14, 18, 26 | 3, 7, 11, 15, 19, 27 |

Always validate pin combinations before configuring I2C.

### Special Pins

- **Pin 99** = Virtual pin for onboard LED (maps to `PICO_DEFAULT_LED_PIN`)
- **Pin 25** = Physical onboard LED on original Pico (not Pico W)

## Command Handler Pattern

Command handlers parse JSON payloads, validate parameters, call HAL, and return JSON responses.

### Header Pattern

```cpp
// i2c_command_handler.h
#pragma once
#include <string>
#include "picojson.h"

typedef void (*i2c_send_response_fn)(const char* type, const picojson::value& data);
typedef void (*i2c_send_error_fn)(const char* message);

void i2c_commands_init(
    i2c_send_response_fn response_fn,
    i2c_send_error_fn error_fn,
    std::string* pending_request_id
);

bool try_handle_i2c_command(const std::string& type, const picojson::object& payload);
```

### Implementation Pattern

```cpp
bool try_handle_i2c_command(const std::string& type, const picojson::object& payload) {
    if (type == "i2c_scan") {
        // Validate params
        auto bus_it = payload.find("bus");
        if (bus_it == payload.end()) {
            send_error("Missing 'bus' parameter");
            return true;
        }
        uint8_t bus = (uint8_t)bus_it->second.get<double>();

        // Call HAL
        i2c_scan_result_t result = hal_i2c_scan(bus);

        // Build JSON response
        picojson::object response;
        picojson::array devices;
        for (int i = 0; i < result.count; i++) {
            devices.push_back(picojson::value((double)result.addresses[i]));
        }
        response["devices"] = picojson::value(devices);

        send_response("i2c_scan_result", picojson::value(response));
        return true;
    }

    return false; // Not handled
}
```

## WebSocket Protocol

Communication between device and cloud uses JSON messages over WebSocket:

```json
// Device → Cloud
{
    "type": "gpio_state",
    "payload": {
        "pin": 15,
        "state": "HIGH"
    },
    "requestId": "abc123"
}

// Cloud → Device
{
    "type": "set_gpio",
    "payload": {
        "pin": 15,
        "state": "HIGH"
    }
}
```

- Every message has a `type` and `payload`
- Request/response pairs use `requestId` for correlation
- The device polls for incoming messages in a single-threaded loop

## CMake Build

### Pico Build

```bash
cd firmware/pico
mkdir -p build && cd build
cmake .. -DPICO_SDK_PATH=/path/to/pico-sdk
make -j$(nproc)
```

### ESP32 Build

```bash
cd firmware/esp32
idf.py build
```

### Graceful Skip

The `package.json` wrapper scripts gracefully skip builds when toolchains aren't installed. Don't fail the monorepo build if CMake or ESP-IDF is missing.

## I2C Bus Configuration

I2C buses support dynamic pin assignment. Configuration must be validated against the pin tables above before applying:

```cpp
bool configure_i2c(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t freq) {
    // 1. Validate bus number (0 or 1)
    // 2. Validate SDA pin is in valid set for this bus
    // 3. Validate SCL pin is in valid set for this bus
    // 4. Apply configuration via HAL
    return hal_i2c_configure(bus, sda_pin, scl_pin, freq);
}
```

## Testing

- **Python tests**: In `.venv/`, test device communication over WebSocket
- **C++ unit tests**: Via CMake test targets
- Build and flash to physical hardware for integration testing

## Checklist

- [ ] All hardware access goes through HAL functions (never platform APIs directly)
- [ ] Pin numbers validated before use (ADC range, I2C valid pairs)
- [ ] Pin 99 used for onboard LED (not hardcoded platform pin)
- [ ] JSON parsing uses picojson with proper error handling
- [ ] Command handler returns `true` if it handled the command, `false` otherwise
- [ ] Response JSON includes the correct `type` field
- [ ] Error responses use `send_error()` with descriptive messages
- [ ] CMake changes don't break graceful skip when toolchain is missing
- [ ] I2C pin combinations validated against RP2040 pin tables

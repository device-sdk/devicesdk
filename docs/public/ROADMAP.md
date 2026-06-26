---
social_image: /og-images/docs/ROADMAP.png
build:
  render: never
  list: never
  publishResources: false
---
# Hardware Roadmap

## Current Hardware Support

| Feature | ESP32 Firmware | Pico Firmware | Core Types | User Script API | Simulator |
|---------|---------------|---------------|------------|-----------------|-----------|
| GPIO digital I/O | Yes | Yes | Yes | Yes | Yes |
| GPIO input monitoring (pull up/down/none) | Yes | Yes | Yes | Yes | Yes |
| PWM output | Yes (LEDC, 13-bit) | Yes (hardware PWM, 16-bit) | Yes | Yes | Yes |
| ADC analog read | Yes (ADC1 only, 12-bit) | Yes (GP26-29, 12-bit) | Yes | Yes | Yes (pins 26-28) |
| I2C master (configure/scan/read/write) | Yes (2 buses) | Yes (2 buses, pin validation) | Yes | Yes | Yes |
| I2C batch write | Yes | Yes | Yes | Yes | No |
| OLED display (SSD1306/SH1106) | Yes | Yes | Yes (full drawing API) | Yes | Yes |
| SPI master | Yes (SPI3) | Yes (SPI0/SPI1) | Yes | Yes | Simulated |
| UART serial | Yes (3 ports, UART0 reserved) | Yes (2 ports) | Yes | Yes | Simulated |
| On-die temperature sensor | Yes | Yes (ADC ch4) | Yes | Yes | Simulated |
| Watchdog timer | Yes | Yes (non-disablable) | Yes | Yes | Simulated |
| Addressable LEDs (WS2812) | No | Yes (PIO) | Yes | Yes | Simulated |
| Device reboot | Yes | Yes (via watchdog) | Yes | Yes | No |
| Onboard LED | Yes (WS2812 RGB on GPIO 8) | Yes (CYW43 on/off only) | No | No | No |

### Platform-Specific Notes

**ESP32-C61:**
- ADC2 is unavailable when WiFi is active (all 10 ADC2 channels blocked)
- PWM uses shared LEDC timer (LEDC_TIMER_0) across all channels
- Addressable LED (WS2812) driven via SPI2 backend (no RMT peripheral on C61)
- I2C supports up to 16 cached device handles per bus

**Pico W / Pico 2 W:**
- I2C has compile-time pin pair validation (6 valid pairs per bus)
- GPIO input monitoring runs on dedicated Core 1
- Onboard LED controlled via CYW43 WiFi coprocessor (virtual pin 99)
- ADC has 4 external channels (GP26-29) plus internal temperature sensor on channel 4

---

## Recently Implemented

The following features were implemented across the full stack (firmware, core types, device sender, API, CLI inspect, simulator):

- **SPI master** (both platforms) - ESP32: SPI3_HOST; Pico: SPI0/SPI1. Configure, transfer, read, write.
- **UART serial** (both platforms) - ESP32: 3 ports (UART0 reserved for debug); Pico: 2 ports. Configure, write, buffered read with timeout.
- **On-die temperature sensor** (both platforms) - ESP32: built-in sensor via `temperature_sensor_get_celsius()`; Pico: ADC channel 4.
- **Watchdog timer** (both platforms) - Configurable timeout, feed command. Pico limitation: cannot disable once enabled.
- **I2C batch write for ESP32** - Parity with existing Pico implementation. Handled inline in websocket handler.
- **PIO / WS2812 addressable LEDs** (Pico only) - PIO state machine driver for WS2812/NeoPixel LED strips.

See [Using SPI](/docs/guides/using-spi/), [Using UART](/docs/guides/using-uart/), and [Addressable LEDs](/docs/guides/addressable-leds/) guides for usage details.

---

## Future Considerations

Features identified as hardware-capable but not yet planned for implementation.

### Both Platforms

#### Timers / Hardware Interrupts
- **Hardware**: ESP32 has 4 GP timers + system timer; Pico has 4 x 32-bit + 1 x 64-bit alarms
- **Firmware status**: Not implemented (GPIO monitoring is poll-based)
- **Use cases**: Precise timing, pulse counting, frequency measurement, debouncing, servo control
- **Effort**: Medium - interrupt-driven events need a new event delivery mechanism to the server

#### On-Device Flash Storage
- **Hardware**: ESP32 has NVS partitions; Pico has 2-4 MB flash
- **Firmware status**: Not exposed (no device-side persistent storage for user scripts)
- **Use cases**: Calibration data, WiFi fallback configs, offline data buffering
- **Effort**: Medium
- **Notes**: Different from the server-side per-device KV storage; this would persist without network connectivity

#### RTC (Real-Time Clock)
- **Hardware**: ESP32 has RTC with battery backup option; Pico has basic RTC
- **Firmware status**: Not exposed
- **Use cases**: Accurate timekeeping without network, timestamp logging, sleep/wake scheduling
- **Effort**: Low-Medium
- **Notes**: Server-side device scripts already have `Date.now()`; on-device RTC is mainly useful for sleep/wake

### ESP32 Only

#### Deep Sleep + Wake Sources
- **Hardware**: Deep sleep with multiple wakeup sources (timer, GPIO, touch, ULP)
- **Firmware status**: Not implemented
- **Use cases**: Battery-powered sensors, solar-powered deployments, periodic reporting
- **Effort**: High - fundamentally changes the connection model; device disconnects during sleep

#### Bluetooth / BLE
- **Hardware**: BLE 5.0 on some ESP32 variants
- **Firmware status**: Not implemented; WiFi and BLE share the radio
- **Use cases**: BLE beacons, BLE peripherals, BLE mesh, phone connectivity
- **Effort**: Very High - entirely new communication stack alongside WiFi

#### I2S (Audio)
- **Hardware**: 2 I2S instances
- **Firmware status**: Not implemented
- **Use cases**: Digital microphones (INMP441), audio output (MAX98357), sound processing
- **Effort**: High - streaming audio over WebSocket is bandwidth-intensive

#### Touch Sensing
- **Hardware**: 14 touch-capable pins on some ESP32 variants
- **Firmware status**: Not implemented
- **Use cases**: Capacitive touch buttons/sliders without external components
- **Effort**: Medium - polling-based reads similar to ADC
- **Notes**: Not available on all ESP32 variants; C61 support needs verification

#### TWAI/CAN Bus
- **Hardware**: CAN 2.0B controller
- **Firmware status**: Not implemented
- **Use cases**: Automotive, industrial automation, robotics
- **Effort**: Medium-High - needs transceiver hardware

### Pico Only

#### DMA (Direct Memory Access)
- **Hardware**: 12 DMA channels with configurable transfers
- **Firmware status**: Not implemented
- **Use cases**: High-speed data transfers (SPI displays, audio streaming, bulk sensor reads)
- **Effort**: High - typically used transparently behind SPI/I2C drivers
- **Notes**: More of an internal optimization than a user-facing feature

#### USB Host Mode
- **Hardware**: USB 2.0 host + device on RP2040/RP2350
- **Firmware status**: USB used for stdio only
- **Use cases**: USB HID devices, USB storage, USB MIDI
- **Effort**: Very High - complex USB stack; security implications

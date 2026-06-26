# DeviceSDK ESP32 firmware - architecture

Contributor reference for the ESP-IDF firmware in `firmware/esp32/`. It explains how the
board connects to a self-hosted DeviceSDK server and how incoming commands reach the
hardware. For build/flash instructions and the status-LED codes, see [`README.md`](README.md).

> Config (Wi-Fi, API token, server host, project/device IDs) lives in
> [`main/config.h`](main/config.h) as **placeholders**. The server patches the real values
> into a prebuilt binary at `devicesdk flash` time - end users never build or edit source.

## Module map

| File | Responsibility |
|------|----------------|
| `main/devicesdk_main.c` | App entry: Wi-Fi bring-up, WebSocket task, event loop, response building, boot/OLED status. |
| `main/websocket_handler.c/.h` | Parses incoming `{type, payload}` JSON (cJSON) into typed commands and enqueues them. |
| `main/worker_task.c/.h` | FreeRTOS worker: dequeues commands, calls the HAL, enqueues responses. |
| `main/hal.c/.h` | Hardware abstraction layer (`devicesdk_hal_*`) - GPIO/PWM/ADC/I2C/SPI/UART/temperature/watchdog/LED/reboot. |
| `main/command_queue.h`, `main/response_queue.h`, `main/shared_buffers.c/.h` | Lock-free-ish queues + shared buffers bridging the WebSocket and worker tasks. |
| `main/display.c/.h`, `main/font5x7.c` | SSD1306-style OLED boot panel + text rendering. |
| `main/base64.c/.h` | Base64 used for binary payloads (e.g. SPI/UART data, framebuffers). |
| `main/config.h`, `main/Kconfig.projbuild` | Compile-time config placeholders + the *DeviceSDK Configuration* menuconfig (onboard LED pin/type). |

## Boot & connection flow

1. **Boot** - `display_boot_text("Booting")`, `devicesdk_hal_blink_led(1)`, init NVS and the HAL.
2. **Wi-Fi** - connect as a WPA2 station to the configured SSID/password; on success
   `display_boot_text("WiFi")`, `devicesdk_hal_blink_led(2)`.
3. **WebSocket** - build the endpoint and connect via `esp_websocket_client`:
   - Path: `/v1/projects/<projectId>/devices/<deviceId>/connect/websocket` (UUIDs from `config.h`).
   - **Transport heuristic**: if the configured host contains an explicit `:port` (a LAN
     install), use plain `ws://` over TCP; otherwise use `wss://` over TLS with the ESP-IDF
     cert bundle. (Documented assumption: an IPv6 literal with a port would also match the
     `:` check - IPv6 isn't a supported transport here.)
   - Auth: an `Authorization: Bearer <token>` header.
   - `display_boot_text("Server")` while connecting; on `WEBSOCKET_EVENT_CONNECTED`,
     `display_boot_text("Connected")` + `devicesdk_hal_blink_led(3)`, and the device sends a
     `{"type":"device connect"}` frame.
4. **Keepalive** - a periodic ping (`DEVICESDK_PING_INTERVAL_MS`, 5 minutes) keeps the
   connection warm.
5. **Reconnect** - on disconnect the panel reverts to `Server` and the client reconnects,
   backing off when the server signals it is rate-limiting reconnections.

## Threading model

Two FreeRTOS tasks decouple the network from the hardware:

- The **WebSocket task** (`devicesdk_main.c` event handler → `websocket_handler.c`) parses each
  inbound frame and pushes a typed command onto the command queue. It never blocks on
  hardware.
- The **worker task** (`worker_task.c`) pops commands, executes them through the HAL, and
  pushes a response onto the response queue, which the WebSocket task serializes back to the
  server. Binary payloads are carried as base64.

## Message protocol

Frames are JSON objects of the shape `{ "type": <string>, "payload": <object> }`.

**Server → device commands** (handled in `websocket_handler.c`):
`set_gpio_state`, `configure_gpio_input`, `set_pwm`,
`i2c_configure` / `i2c_scan` / `i2c_probe` / `i2c_write` / `i2c_read` / `i2c_batch_write`,
`spi_configure` / `spi_transfer` / `spi_write` / `spi_read`,
`uart_configure` / `uart_write` / `uart_read`,
`get_temperature`, `watchdog_configure` / `watchdog_feed`, `reboot`.

**Device → server responses/events** (built in `devicesdk_main.c`):
`command_ack` (with the acked command), `command_error`, `pin_state_update` (monitored
input changes), and typed results `i2c_scan_result`, `i2c_read_result`,
`temperature_result`, `spi_transfer_result`, `spi_read_result`, `uart_read_result`. The
device also sends `device connect` on connect and periodic pings.

The onboard LED is exposed as virtual **pin 99** so `set_gpio_state { "pin": 99, "state":
"high" | "low" }` controls it once the device is connected.

## Hardware abstraction layer

All hardware access goes through `main/hal.h` (`devicesdk_hal_*`), so the command handlers stay
target-agnostic and only the HAL is per-chip. The surface covers system
(`init`/`reboot`/`blink_led`), GPIO (digital/analog read, configurable pull, write), PWM,
I2C (configure/scan/probe/read/write), SPI (configure/transfer/read/write), UART
(configure/read/write), the on-die temperature sensor, and the watchdog.

## References

- [RFC 6455 - The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/stable/)
- [`esp_websocket_client`](https://components.espressif.com/components/espressif/esp_websocket_client) and [cJSON](https://github.com/DaveGamble/cJSON)

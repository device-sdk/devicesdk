# DeviceSDK Client Implementation Guide

This document provides a comprehensive description of the DeviceSDK Client firmware implementation for the Raspberry Pi Pico W. It is designed to help you port this implementation to other platforms, specifically ESP32 with ESP-IDF.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Initialization Sequence](#initialization-sequence)
3. [Network Layer Implementation](#network-layer-implementation)
4. [WebSocket Protocol Implementation](#websocket-protocol-implementation)
5. [Message Protocol & Command Handling](#message-protocol--command-handling)
6. [Hardware Abstraction Layer](#hardware-abstraction-layer)
7. [Status Signaling](#status-signaling)
8. [Build System & Configuration](#build-system--configuration)
9. [Platform-Specific Details](#platform-specific-details)
10. [ESP32 Port Considerations](#esp32-port-considerations)

---

## Architecture Overview

The firmware follows a modular, layered architecture:

```
┌─────────────────────────────────────────┐
│           main.cpp                      │
│  (Orchestrator & Main Loop)             │
└─────────────────────────────────────────┘
            │           │
            ▼           ▼
┌──────────────────┐  ┌──────────────────┐
│ websocket_handler│  │       hal        │
│  (Message Parse) │  │  (HW Abstraction)│
└──────────────────┘  └──────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│         WebsocketClient                 │
│  (lib/lwip_ws/ws_client.cpp)            │
└─────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│         lwIP TCP/IP Stack               │
│  (DNS, TCP, IP, Ethernet)               │
└─────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│    CYW43 Wi-Fi Driver (Pico W)          │
└─────────────────────────────────────────┘
```

### Key Components

1. **main.cpp**: Entry point, initialization, and main event loop
2. **websocket_handler**: JSON message parsing and command dispatching
3. **hal (Hardware Abstraction Layer)**: Platform-agnostic hardware interface
4. **WebsocketClient**: WebSocket protocol implementation over TCP
5. **lwIP**: Lightweight TCP/IP stack
6. **picojson**: Header-only JSON parser

---

## Initialization Sequence

The firmware follows a strict initialization order:

### 1. System Initialization (`main.cpp:20-26`)

```cpp
stdio_init_all();              // Initialize USB serial I/O
if (cyw43_arch_init()) {       // Initialize Wi-Fi chip
    printf("Wi-Fi init failed");
    return -1;
}
```

**ESP32 Equivalent:**
- `esp_log_level_set()` for logging
- `nvs_flash_init()` for non-volatile storage
- `esp_netif_init()` for network interface
- `esp_event_loop_create_default()` for event handling

### 2. Status Indication

```cpp
blink(1);  // Boot blink
```

Visual feedback that the device has started.

### 3. Wi-Fi Connection (`main.cpp:30-39`)

```cpp
cyw43_arch_enable_sta_mode();
if (cyw43_arch_wifi_connect_timeout_ms(
    WIFI_SSID, 
    WIFI_PASSWORD, 
    CYW43_AUTH_WPA2_AES_PSK, 
    30000)) {
    // Handle failure
} else {
    blink(2);  // Wi-Fi connected blink
}
```

**Key Details:**
- Uses WPA2-AES-PSK authentication
- 30-second timeout for connection
- Blocking call (waits for connection)
- Credentials are compile-time constants

**ESP32 Equivalent:**
- `esp_wifi_init()` with config
- `esp_wifi_set_mode(WIFI_MODE_STA)`
- `esp_wifi_set_config()` with SSID/password
- `esp_wifi_start()` and wait for `WIFI_EVENT_STA_CONNECTED`

### 4. WebSocket Connection (`main.cpp:41-42`)

```cpp
WebsocketClient client;
client.connect("api.devicesdk.com", 80, "/v1/projects/1/devices/2/connect/websocket", WEBSOCKET_TOKEN);
```

Initiates DNS lookup and TCP connection to the WebSocket server.

### 5. Main Event Loop (`main.cpp:47-70`)

```cpp
while (true) {
    cyw43_arch_poll();     // Poll Wi-Fi driver
    client.poll();          // Poll WebSocket client
    
    if (client.is_connected()) {
        // Send initial message once
        // Send periodic pings (every 60s)
    }
    
    sleep_ms(1);            // Prevent busy-waiting
}
```

**Key Behaviors:**
- 1ms sleep to yield CPU and save power
- Continuous polling for network events
- State management for connection status

---

## Network Layer Implementation

### DNS Resolution (`ws_client.cpp:19-35`)

The WebSocket client uses lwIP's asynchronous DNS API:

```cpp
err_t err = dns_gethostbyname(host, &remote_addr, dns_found_callback, this);
if (err == ERR_OK) {
    // Address was cached, proceed immediately
    on_dns_found(&remote_addr);
} else if (err != ERR_INPROGRESS) {
    // DNS error
}
```

**Key Points:**
- Asynchronous callback-based API
- DNS results may be cached
- Callback receives the resolved IP address

**ESP32 Equivalent:**
- Use `getaddrinfo()` or `esp_netif_get_hostname()`
- ESP-IDF provides standard POSIX sockets API

### TCP Connection (`ws_client.cpp:63-85`)

Once DNS resolves, a TCP connection is established:

```cpp
tcp_pcb = tcp_new_ip_type(IP_GET_TYPE(&remote_addr));
tcp_arg(tcp_pcb, this);
tcp_poll(tcp_pcb, tcp_poll_callback, 1);
tcp_sent(tcp_pcb, tcp_sent_callback);
tcp_recv(tcp_pcb, tcp_recv_callback);
tcp_err(tcp_pcb, tcp_err_callback);
tcp_connect(tcp_pcb, &remote_addr, 80, tcp_connected_callback);
```

**Key Points:**
- Uses lwIP's raw TCP API (not sockets)
- All operations are callback-based
- Callbacks are registered before connecting
- Connection is non-blocking

**ESP32 Equivalent:**
- Use standard BSD sockets: `socket()`, `connect()`
- Can be blocking or non-blocking with `fcntl()` or `O_NONBLOCK`

### Thread Safety (`ws_client.cpp:24-26, 48-50`)

All lwIP operations are wrapped in thread-safety primitives:

```cpp
cyw43_arch_lwip_begin();
// ... lwIP calls ...
cyw43_arch_lwip_end();
```

**ESP32 Equivalent:**
- ESP-IDF's lwIP is already thread-safe when using the socket API
- For raw API, use `LOCK_TCPIP_CORE()` / `UNLOCK_TCPIP_CORE()`

---

## WebSocket Protocol Implementation

The WebSocket client implements the core WebSocket protocol (RFC 6455) over a plain TCP connection.

### HTTP Upgrade Handshake (`ws_client.cpp:87-111`)

After TCP connection, an HTTP upgrade request is sent:

```cpp
GET /v1/projects/1/devices/2/connect/websocket HTTP/1.1
Host: api.devicesdk.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Authorization: Bearer {token}
```

**Key Points:**
- Uses a fixed WebSocket key (not cryptographically secure, but functional)
- Authorization via Bearer token in HTTP header
- Connection state transitions to `connected_state = 2` after sending

**Limitations:**
- Does not validate the server's handshake response
- Assumes the first non-WebSocket frame is the HTTP response and ignores it

### Frame Building (Client → Server) (`ws_client.cpp:139-166`)

WebSocket frames sent from client to server:

```
Byte 0: FIN (1 bit) + RSV (3 bits) + Opcode (4 bits)
Byte 1: MASK (1 bit) + Payload Length (7 bits)
Bytes 2-5: Masking Key (if MASK=1)
Bytes 6+: Masked Payload Data
```

**Implementation:**

```cpp
buffer[0] = 0x80 | WEBSOCKET_OPCODE_TEXT; // FIN=1, Opcode=1 (text)
buffer[1] = payload_len | 0x80;            // MASK=1
// Generate random 4-byte mask
uint32_t mask_key = rand();
// Copy mask to frame
// XOR payload with mask
for (size_t i = 0; i < payload_len; ++i) {
    buffer[header_len + i] = payload[i] ^ mask_bytes[i % 4];
}
```

**Key Points:**
- All client-to-server frames MUST be masked (per RFC 6455)
- Only supports payload length < 126 bytes (no extended length)
- Uses `rand()` for mask key (requires `pico_rand` library)
- FIN bit always set (no fragmentation support)

**Limitations:**
- No support for payloads ≥ 126 bytes
- No fragmentation
- Only TEXT frames (opcode 0x1)

### Frame Parsing (Server → Client) (`ws_client.cpp:168-195`)

```cpp
uint8_t opcode = buffer[0] & 0x0F;
size_t payload_len = buffer[1] & 0x7F;
size_t payload_offset = 2;

if (opcode == WEBSOCKET_OPCODE_TEXT) {
    std::string payload(buffer + payload_offset, payload_len);
    // Parse JSON and handle message
}
```

**Key Points:**
- Assumes server frames are NOT masked (per RFC 6455)
- Only handles TEXT frames (0x1)
- Ignores extended payload length (126/127 markers)
- Ignores HTTP upgrade response by checking for "HT" prefix

**Limitations:**
- No PING/PONG handling
- No CLOSE frame handling
- No binary frame support
- No fragmentation handling

---

## Message Protocol & Command Handling

### Message Format

All messages are JSON objects with a `type` field and optional `payload` field:

```json
{
  "type": "message_type",
  "payload": { ... }
}
```

### Outgoing Messages (`main.cpp:54, 62`)

#### Device Connect (Sent once on connection)

```json
{"type": "device connect"}
```

#### Ping (Sent every 60 seconds)

```json
{"type": "ping"}
```

**Implementation:**

```cpp
uint32_t now = to_ms_since_boot(get_absolute_time());
if (now - last_ping_time > 60000) {
    client.send_text("{\"type\": \"ping\"}");
    last_ping_time = now;
}
```

### Incoming Messages (`websocket_handler.cpp`)

The `handle_websocket_message()` function dispatches commands based on the `type` field.

#### set_gpio_state Command

```json
{
  "type": "set_gpio_state",
  "payload": {
    "pin": 25,
    "state": "high"  // or "low"
  }
}
```

**Handler Implementation:**

```cpp
if (type == "set_gpio_state") {
    // Extract pin (double → uint8_t)
    uint8_t pin = (uint8_t)payload["pin"].get<double>();
    
    // Extract state (string → enum)
    const std::string& state_str = payload["state"].get<std::string>();
    gpio_state_t state = (state_str == "high") 
        ? GPIO_STATE_HIGH 
        : GPIO_STATE_LOW;
    
    // Execute command
    hal_set_gpio(pin, state);
}
```

**Key Points:**
- JSON numbers are parsed as `double` (IEEE 754)
- Type validation is performed before parsing
- Invalid states are logged and ignored
- No response is sent back to the server (fire-and-forget)

### JSON Parsing (`picojson`)

Uses the picojson header-only library:

```cpp
picojson::value v;
std::string err = picojson::parse(v, json_string);
if (err.empty()) {
    // Parse successful
    const picojson::object& obj = v.get<picojson::object>();
}
```

**ESP32 Equivalent:**
- Use `cJSON` (included in ESP-IDF)
- Or use `ArduinoJson` for Arduino framework

---

## Hardware Abstraction Layer

The HAL provides platform-agnostic hardware interfaces.

### GPIO Control (`hal.cpp:9-18`)

```cpp
void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    bool pin_state = (state == GPIO_STATE_HIGH);
    if (pin == 99) {
        // Special case: onboard LED via Wi-Fi chip
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, pin_state);
    } else {
        // Standard GPIO
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_OUT);
        gpio_put(pin, pin_state);
    }
}
```

**Key Points:**
- Pin 99 is a virtual pin for the onboard LED
- GPIO pins are initialized on first use
- Direction is always set to OUTPUT
- No input pin support yet

**ESP32 Equivalent:**

```c
void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    gpio_set_direction(pin, GPIO_MODE_OUTPUT);
    gpio_set_level(pin, state == GPIO_STATE_HIGH ? 1 : 0);
}
```

### Initialization (`hal.cpp:5-7`)

```cpp
void hal_init() {
    // Nothing to do here for now
}
```

Currently a no-op, but provides a hook for future initialization (e.g., ADC, PWM setup).

### Future Extensions (from AGENTS.md)

The HAL is designed to be extended with:

- `hal_read_adc(uint8_t channel)` - Read analog input
- `hal_set_pwm(uint8_t pin, uint32_t freq, float duty_cycle)` - PWM output
- `hal_apply_config(config_t* config)` - Apply a configuration structure

---

## Status Signaling

### LED Blink Patterns (`main.cpp:11-18`)

```cpp
void blink(int count) {
    for (int i = 0; i < count; ++i) {
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 1);
        sleep_ms(100);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 0);
        sleep_ms(100);
    }
}
```

### Status Codes (from README.md)

| Blinks | Meaning | Location in Code |
|--------|---------|------------------|
| 1 | Boot complete | `main.cpp:28` |
| 2 | Wi-Fi connected | `main.cpp:38` |
| 3 | WebSocket connected | `main.cpp:53` |

**Note:** The README mentions additional error codes (long blinks, repeating patterns) that are NOT implemented in the current codebase:
- Wi-Fi failure: 1 long blink (not implemented)
- WebSocket failure: 2 long + 1 short (not implemented)
- Success: 5 rapid blinks (not implemented)

The actual implementation only has 1, 2, and 3 quick blinks for the happy path.

---

## Build System & Configuration

### CMake Configuration (`CMakeLists.txt`)

#### Compiler Settings

```cmake
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(PICO_CXX_ENABLE_EXCEPTIONS 1)
```

C++17 is required for picojson. Exceptions are enabled.

#### Target Board Selection

```cmake
if(DEFINED ENV{DEVICESDK_BOARD})
    set(PICO_BOARD "$ENV{DEVICESDK_BOARD}" CACHE STRING "Board type")
else()
    set(PICO_BOARD pico_w CACHE STRING "Board type")
endif()
```

Supports `pico_w` and `pico2_w` boards via environment variable.

#### Compile-Time Credentials

```cmake
target_compile_definitions(devicesdk-client PRIVATE
    DEVICESDK_WIFI_SSID="${WIFI_SSID}"
    DEVICESDK_WIFI_PASSWORD="${WIFI_PASSWORD}"
    DEVICESDK_API_TOKEN="${API_TOKEN}"
)
```

Credentials are passed as preprocessor macros, but the actual `main.cpp` file has placeholder strings that are replaced by a build script (not shown in the codebase).

**Current Implementation in `main.cpp:7-9`:**

```cpp
const char WIFI_SSID[] = "DUMMY_SSID______________________";
const char WIFI_PASSWORD[] = "DUMMY_PASS_____________________________________________________";
const char WEBSOCKET_TOKEN[] = "00000000000000000000000000000000";
```

These placeholder strings are likely replaced by a binary patch or linker script.

#### lwIP Configuration

```cmake
target_compile_definitions(devicesdk-client PRIVATE
    NO_SYS=1          # No RTOS
    LWIP_SOCKET=0     # Disable socket API
    LWIP_NETCONN=0    # Disable netconn API
)
```

Uses lwIP's raw API (not sockets).

#### Library Dependencies

```cmake
target_link_libraries(devicesdk-client
    pico_stdlib                              # Standard library
    pico_cyw43_arch_lwip_threadsafe_background  # Wi-Fi + lwIP
    pico_rand                                # Random number generation
    pico_lwip                                # TCP/IP stack
)
```

**Key Library:**
- `pico_cyw43_arch_lwip_threadsafe_background`: Provides background Wi-Fi processing and thread-safe lwIP access

#### Output Files

```cmake
pico_add_extra_outputs(devicesdk-client)
```

Generates:
- `devicesdk-client.elf` - ELF executable
- `devicesdk-client.uf2` - USB Flashing Format (drag-and-drop)
- `devicesdk-client.bin` - Raw binary
- `devicesdk-client.hex` - Intel HEX format

### lwIP Configuration (`lwipopts.h`)

Key settings:

```c
#define NO_SYS                      1      // No RTOS
#define LWIP_SOCKET                 0      // No sockets
#define MEM_SIZE                    4000   // Heap size
#define TCP_MSS                     1460   // Maximum segment size
#define TCP_WND                     (8 * TCP_MSS)  // Window size
#define LWIP_DHCP                   1      // DHCP client
#define LWIP_DNS                    1      // DNS resolver
#define LWIP_TCP_KEEPALIVE          1      // TCP keepalive
```

**ESP32 Differences:**
- ESP-IDF uses lwIP with `NO_SYS=0` (with FreeRTOS)
- Socket API is typically enabled
- Different memory constraints

### mbedTLS Configuration (`mbedtls_config.h`)

Required for WPA2 Wi-Fi authentication:

```c
#define MBEDTLS_NO_PLATFORM_ENTROPY
#define MBEDTLS_ENTROPY_HARDWARE_ALT
#define MBEDTLS_AES_C
#define MBEDTLS_SHA256_C
// ... many more crypto primitives
```

**Note:** While TLS is configured, the WebSocket connection uses plain HTTP (port 80), not HTTPS/WSS. The mbedTLS configuration is primarily for WPA2 Wi-Fi encryption.

**ESP32 Equivalent:**
- ESP-IDF includes mbedTLS by default
- Use `menuconfig` to configure mbedTLS features

---

## Platform-Specific Details

### Raspberry Pi Pico W Hardware

#### Wi-Fi Chip (CYW43439)

- Infineon CYW43439 Wi-Fi/Bluetooth chip
- Connected via SPI to RP2040
- Shares control of the onboard LED
- Requires the `cyw43_driver` component

#### Onboard LED

- **Not** connected to a GPIO pin
- Controlled via the CYW43 Wi-Fi chip
- Accessed using `cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, state)`
- Assigned virtual pin number **99** in the HAL

#### USB Serial

- USB acts as a serial console (CDC-ACM)
- Enabled with `pico_enable_stdio_usb(devicesdk-client 1)`
- Used for debug logging with `printf()`

### Memory Constraints

- **Flash**: 2MB (RP2040)
- **RAM**: 264KB (RP2040)
- **lwIP heap**: 4KB (`MEM_SIZE`)

---

## ESP32 Port Considerations

### Network Stack Differences

| Feature | Pico W (lwIP Raw) | ESP32 (ESP-IDF) |
|---------|-------------------|-----------------|
| API Style | Callback-based raw API | BSD sockets or lwIP netconn |
| Threading | Background polling | FreeRTOS tasks |
| DNS | Async callbacks | `getaddrinfo()` |
| TCP | `tcp_pcb` API | `socket()`, `connect()` |
| TLS Support | Manual (altcp_tls) | Built-in with `esp_tls` |

### Recommended ESP32 Architecture

```c
// Use FreeRTOS tasks
void websocket_task(void *pvParameters) {
    // Create socket
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    
    // DNS resolution
    struct addrinfo hints, *res;
    getaddrinfo("api.devicesdk.com", "80", &hints, &res);
    
    // Connect
    connect(sock, res->ai_addr, res->ai_addrlen);
    
    // Send HTTP upgrade
    send(sock, upgrade_request, len, 0);
    
    // Main loop
    while (1) {
        recv(sock, buffer, sizeof(buffer), 0);
        // Parse and handle messages
    }
}

void app_main() {
    // Initialize NVS, netif, event loop
    nvs_flash_init();
    esp_netif_init();
    esp_event_loop_create_default();
    
    // Initialize Wi-Fi
    esp_wifi_init(&cfg);
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_start();
    
    // Wait for connection
    EventBits_t bits = xEventGroupWaitBits(...);
    
    // Start WebSocket task
    xTaskCreate(&websocket_task, "websocket", 4096, NULL, 5, NULL);
}
```

### GPIO Mapping

ESP32 GPIO is more straightforward:

```c
#include "driver/gpio.h"

void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << pin),
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&io_conf);
    gpio_set_level(pin, state == GPIO_STATE_HIGH ? 1 : 0);
}
```

**ESP32 Onboard LED:**
- Typically on GPIO2 (varies by board)
- Standard GPIO, not special handling needed
- Remove the `pin == 99` special case

### Wi-Fi Connection

```c
#include "esp_wifi.h"

wifi_config_t wifi_config = {
    .sta = {
        .ssid = WIFI_SSID,
        .password = WIFI_PASSWORD,
        .threshold.authmode = WIFI_AUTH_WPA2_PSK,
    },
};

esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
esp_wifi_connect();

// Wait for IP_EVENT_STA_GOT_IP event
```

### JSON Parsing

Use cJSON (included in ESP-IDF):

```c
#include "cJSON.h"

cJSON *json = cJSON_Parse(message);
cJSON *type = cJSON_GetObjectItem(json, "type");
if (cJSON_IsString(type)) {
    if (strcmp(type->valuestring, "set_gpio_state") == 0) {
        // Handle command
    }
}
cJSON_Delete(json);
```

### WebSocket Libraries for ESP32

Instead of implementing from scratch, consider:

1. **esp_websocket_client** (ESP-IDF component)
   - Built-in WebSocket client
   - Supports WSS (TLS)
   - Event-driven API

2. **libwebsockets**
   - Full-featured WebSocket library
   - Available as ESP-IDF component

Example with esp_websocket_client:

```c
#include "esp_websocket_client.h"

esp_websocket_client_config_t ws_cfg = {
    .uri = "ws://api.devicesdk.com/v1/projects/1/devices/2/connect/websocket",
    .headers = "Authorization: Bearer token\r\n",
};

esp_websocket_client_handle_t client = esp_websocket_client_init(&ws_cfg);
esp_websocket_register_events(client, WEBSOCKET_EVENT_DATA, ws_event_handler, NULL);
esp_websocket_client_start(client);
```

### Configuration Storage

**Pico W:** Compile-time configuration only

**ESP32:** Use NVS (Non-Volatile Storage) for runtime configuration:

```c
#include "nvs_flash.h"

nvs_handle_t nvs_handle;
nvs_open("storage", NVS_READWRITE, &nvs_handle);

char ssid[32];
size_t ssid_len = sizeof(ssid);
nvs_get_str(nvs_handle, "wifi_ssid", ssid, &ssid_len);
```

This allows changing credentials without reflashing.

### Build System

**Pico W:** CMake with Ninja

**ESP32:** Use `idf.py` build system:

```bash
idf.py create-project devicesdk-client
cd devicesdk-client
idf.py menuconfig  # Configure project
idf.py build
idf.py flash
idf.py monitor
```

---

## Summary of Key Behaviors

### Connection Lifecycle

1. **Boot** → Initialize systems
2. **Wi-Fi Connect** → Block until connected (30s timeout)
3. **DNS Lookup** → Resolve server hostname (async)
4. **TCP Connect** → Establish TCP connection
5. **WebSocket Handshake** → Send HTTP Upgrade request
6. **Connected** → Send initial "device connect" message
7. **Steady State** → Poll for messages, send pings every 60s

### Error Handling

**Current Implementation:**
- Wi-Fi failure: Return from `main()` with error code
- DNS/TCP failure: Log to console, connection remains in disconnected state
- WebSocket message parse failure: Log error, continue

**Missing Error Handling:**
- No automatic reconnection
- No retry logic
- No timeout handling for WebSocket ping/pong
- No handling of connection drops after initial connection

### Message Flow

```
Device → Server: {"type": "device connect"}
Device → Server: {"type": "ping"} (every 60s)
Server → Device: {"type": "set_gpio_state", "payload": {...}}
Device: Executes command silently
```

No acknowledgment or error responses are sent back to the server.

### Threading Model

**Pico W:**
- Single-threaded with cooperative multitasking
- lwIP runs in background via `pico_cyw43_arch_lwip_threadsafe_background`
- Main loop polls both Wi-Fi and WebSocket

**ESP32:**
- Multi-threaded with FreeRTOS
- Separate tasks for WebSocket, event handling
- Synchronization via queues, semaphores, event groups

---

## Complete Implementation Checklist for ESP32

### Phase 1: Basic Structure
- [ ] Set up ESP-IDF project structure
- [ ] Implement HAL for GPIO (remove pin 99 special case)
- [ ] Implement basic LED status signaling
- [ ] Set up logging

### Phase 2: Network Layer
- [ ] Wi-Fi initialization and connection
- [ ] Event handlers for Wi-Fi events
- [ ] DNS resolution using `getaddrinfo()`
- [ ] TCP socket connection

### Phase 3: WebSocket Protocol
- [ ] Option A: Use esp_websocket_client library (recommended)
- [ ] Option B: Implement manual WebSocket handshake
- [ ] Implement frame building with masking
- [ ] Implement frame parsing
- [ ] Handle TEXT frames

### Phase 4: Message Protocol
- [ ] Integrate cJSON for JSON parsing
- [ ] Implement message dispatcher
- [ ] Implement `set_gpio_state` handler
- [ ] Send `device connect` message on connection
- [ ] Implement 60-second ping timer

### Phase 5: Configuration
- [ ] Decide: Compile-time vs NVS storage
- [ ] Implement credential management
- [ ] Add menuconfig options

### Phase 6: Error Handling & Reliability
- [ ] Implement reconnection logic
- [ ] Add connection state machine
- [ ] Handle disconnections gracefully
- [ ] Add watchdog timer
- [ ] Implement proper error signaling

### Phase 7: Future Features (Optional)
- [ ] ADC reading support
- [ ] PWM control support
- [ ] TLS/WSS support for secure connections
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Device provisioning (e.g., BLE, AP mode)

---

## References

- **WebSocket Protocol:** RFC 6455 (https://datatracker.ietf.org/doc/html/rfc6455)
- **lwIP Documentation:** https://www.nongnu.org/lwip/
- **ESP-IDF Programming Guide:** https://docs.espressif.com/projects/esp-idf/
- **Raspberry Pi Pico SDK:** https://github.com/raspberrypi/pico-sdk
- **picojson:** https://github.com/kazuho/picojson
- **cJSON:** https://github.com/DaveGamble/cJSON

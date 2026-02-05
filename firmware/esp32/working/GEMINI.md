# Gemini Agent Guide for the `iotkit` Project

Hello! You are an AI coding agent tasked with developing the C++ firmware for the `iotkit` project. This document is your guide to understanding the project's structure, goals, and key components.

## 1. Project Goal & Core Concept

**Your primary mission is to build the `iotkit-client` firmware for the Raspberry Pi Pico W.**

The core concept is to create a firmware that connects a Pico W to a pre-configured Wi-Fi network and a cloud WebSocket API. The Wi-Fi credentials (`SSID` and `password`) and the API authentication token are embedded into the firmware at compile-time via environment variables.

## 2. Key Source Code Modules & Their Responsibilities

This is your map of the codebase.

| Module Files (`src/`)       | Responsibility                                                                                                 | Key Functions to Know                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **`websocket_handler.h` / `.cpp`** | **Real-time Comms**: Manages the persistent WebSocket connection, message parsing, and command dispatching. | `handle_websocket_message()`                                            |
| **`hal.h` / `.cpp`**        | **Hardware Abstraction Layer**: Translates logical commands (e.g., "set pin 25 high") into Pico SDK hardware calls. | `hal_set_gpio()`, `hal_read_adc()`, `hal_apply_config()`                         |
| **`main.cpp`**              | **Orchestrator**: The entry point. It initializes the system, connects to Wi-Fi, and starts the WebSocket client. | `main()`                                                                             |

## 3. The `main.cpp` Logic Flow

Your `main()` function should implement this logic:

```cpp
int main() {
    // 1. Initialize core systems (USB Serial, Wi-Fi, etc.)
    stdio_init_all();
    hal_init();
    cyw43_arch_init();

    // 2. Connect to Wi-Fi using credentials from the build.
    cyw43_arch_wifi_connect_timeout_ms(...);

    // 3. Connect to the WebSocket server using the API token from the build.
    websocket_connect(api_token);
    
    // 4. Enter the main application loop. This loop primarily:
    //    - Processes WebSocket events.
    //    - Manages the connection state.
    //    - Sleeps to conserve power.
    while(true) { 
        websocket_poll();
        cyw43_arch_poll();
        sleep_ms(1);
    }
}
```

## 4. How to Approach a Task

When you receive a task like "Implement PWM control," follow these steps:

1.  **Consult `api-specification.md`**: Check for the expected WebSocket message structure for the command (e.g., a `set_pwm` message).
2.  **Identify Modules**:
    *   `websocket_handler.cpp`: This needs a new `case` or `if` block in its message handling logic to process the `"set_pwm"` message type and parse its payload.
    *   `hal.h` / `.cpp`: This needs a new function, `hal_set_pwm(uint8_t pin, uint32_t freq, float duty_cycle)`, that contains the actual `hardware/pwm.h` SDK calls.
    *   The WebSocket handler will call the HAL function.
3.  **Implement the Code**: Write the necessary C++ code in the identified files.

## 5. Important Reminders

*   **Do Not Commit**: Never commit changes to the repository.
*   **Configuration**: All configuration (Wi-Fi credentials, API tokens) is handled via environment variables at build time. Do not write code that attempts to read credentials from other sources.
*   **Error Handling**: Do not assume operations will succeed. Check return codes from SDK functions. When a WebSocket command fails at the hardware level, use the `command_error` message type to report it back to the server.
*   **Dependencies**: When adding a new library, make sure to update the `CMakeLists.txt` file correctly.

## 6. Building and Flashing

After making any code changes, it is critical to build and flash the firmware.

### Building the Firmware

1.  **Set Environment Variables**:
    ```bash
    export IOTKIT_WIFI_SSID="YourWifiNetworkName"
    export IOTKIT_WIFI_PASSWORD="YourWifiPassword"
    export IOTKIT_API_TOKEN="YourSecretApiToken"
    ```
2.  **Run the build command**:
    ```bash
    ninja -C build
    ```
    This will compile the code and generate `iotkit-client.elf` and `iotkit-client.uf2` files in the `build` directory.

> **Build System Note:** This project is configured to use the **Ninja** build system. If you encounter an error where `build.ninja` is not found, it means the build directory was likely initialized with a different generator (e.g., Makefiles). To fix this, you must perform a clean build:
> 1.  Delete the build directory: `rm -rf build`
> 2.  Re-configure CMake, explicitly setting the generator to Ninja: `cmake -S . -B build -G "Ninja"`
> 3.  Re-run the `ninja -C build` command.

### Flashing the Firmware

After a successful build, you can flash the firmware directly to a connected Pico W (that is not in BOOTSEL mode) using `picotool`.

1.  **Ensure the device is connected** via USB.
2.  **Run the flash command**:
    ```bash
    picotool load build/iotkit-client.elf -fx
    ```
    This command will load the firmware and automatically reboot the device.

## 7. Key Technical Learnings & Gotchas

This section contains important technical details discovered during development.

*   **WPA2 Wi-Fi requires mbedTLS**: A standard Wi-Fi connection using `CYW43_AUTH_WPA2_AES_PSK` will fail silently if the mbedTLS libraries are not correctly linked. The `CMakeLists.txt` file **must** link `pico_lwip_mbedtls` and `pico_mbedtls`.
*   **Secure WebSockets (`wss://`) require a manual handshake**: The provided `lwip_ws` library does not support TLS. To connect to a `wss://` endpoint, a secure TLS connection must be established first using `altcp_tls`, and then the WebSocket HTTP Upgrade handshake must be performed manually over that connection.
*   **Build Configuration Files**: For TLS to work, the project requires two configuration files in the root directory:
    1.  `mbedtls_config.h`: Configures the mbedTLS library features.
    2.  `lwipopts.h`: Configures lwIP, and critically, must enable ALTCP and ALTCP_TLS.
*   **Onboard LED Control**: The Pico W's onboard LED is not a standard GPIO pin. It must be controlled via the Wi-Fi chip using `cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, state)`. In this project, it is assigned the virtual pin number `99` in the HAL.
*   **Connection Details**:
    *   **WebSocket Host**: `api.iotkit.dev`
    *   **WebSocket Path**: `/v1/projects/1/devices/2/connect/websocket`
*   **Build Cache**: When changing build-time options in `CMakeLists.txt` (like credential defaults), the build directory must be deleted (`rm -rf build`) before re-running CMake to ensure the changes take effect.
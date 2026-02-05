# iotkit-client

This repository contains the C++ firmware for the `iotkit-client`, designed to run on a Raspberry Pi Pico W.

## Overview

The firmware connects the Pico W to a Wi-Fi network and establishes a persistent WebSocket connection to a cloud backend. This allows for real-time, bidirectional communication to control the device's hardware (like GPIO pins) and receive data from it.

The configuration is done at compile-time, meaning the Wi-Fi credentials and API token are embedded directly into the firmware binary.

## Getting Started

### Prerequisites

1.  **Raspberry Pi Pico SDK**: Ensure you have the [Pico SDK](https://github.com/raspberrypi/pico-sdk) installed and configured on your system.
2.  **CMake**: The project uses CMake for building.
3.  **Ninja**: For fast builds.

### Configuration

The firmware can be configured by setting environment variables before building. However, the Wi-Fi SSID, password, and API token have default values for convenience.

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `IOTKIT_WIFI_SSID` | The name (SSID) of your Wi-Fi network. | `"Caravela"` |
| `IOTKIT_WIFI_PASSWORD` | The password for your Wi-Fi network. | `"12345679"` |
| `IOTKIT_API_TOKEN` | The secret token for authenticating with the API. | `"30a1e5ed66c4439ebff0cab8cf4b71b0"` |

To override the defaults, set the variables in your shell:
```bash
export IOTKIT_WIFI_SSID="Your_SSID"
export IOTKIT_API_TOKEN="Your_Secret_Token"
```

### Building the Firmware

1.  **Clean Build (Recommended)**: If you have changed configuration or are building for the first time, it's best to start clean.
    ```bash
    rm -rf build
    ```
2.  Run CMake to configure the project. Using the `-G "Ninja"` flag is recommended.
    ```bash
    cmake -S . -B build -G "Ninja"
    ```
3.  Run Ninja to compile the firmware:
    ```bash
    ninja -C build
    ```

This will generate a `iotkit-client.uf2` file inside the `build` directory.

### Flashing the Firmware

1.  Connect your Pico W to your computer while holding the **BOOTSEL** button. It will appear as a mass storage device named `RPI-RP2`.
2.  Drag and drop the `iotkit-client.uf2` file onto the `RPI-RP2` drive.
3.  The device will automatically reboot and begin operation.

## Device Status & Remote Control

### LED Status Codes

The onboard LED on the Pico W indicates the device's status.

*   **Booting**: Three rapid blinks on startup.
*   **Wi-Fi Connection Failure**: One long blink, repeating.
*   **WebSocket Connection Failure**: Two long blinks followed by one short blink, repeating. The device will automatically retry the connection every 5 seconds.
*   **Successfully Connected**: Five rapid blinks. After this sequence, the LED will turn off and will no longer blink status codes. It is now available for remote control.

### Remote LED Control

Once connected, the onboard LED can be controlled by sending `set_gpio_state` commands over the WebSocket. The LED has been assigned the virtual **pin number `99`**.

*   **Turn LED ON**:
    ```json
    {
      "type": "set_gpio_state",
      "payload": {
        "pin": 99,
        "state": "high"
      }
    }
    ```
*   **Turn LED OFF**:
    ```json
    {
      "type": "set_gpio_state",
      "payload": {
        "pin": 99,
        "state": "low"
      }
    }
    ```
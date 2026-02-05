# Device Script Templates

This folder contains example device scripts that can be uploaded to your IoT projects. Each script demonstrates different features of the programmable IoT cloud platform.

## How to Use

1. Copy the contents of any template file
2. Modify it for your specific hardware (pin numbers, sensor addresses, etc.)
3. Upload it via the API: `POST /v1/projects` with your `project-id` and `script`

## Available Templates

### `basic-blink.js`
Simple LED blinking example. Great starting point for new users.
- Demonstrates `onDeviceConnect`, `onDeviceDisconnect`, `onMessage`
- Shows GPIO output control with `env.DEVICE.setGpioState()`
- Uses `env.logger` for logging

### `temperature-monitor.js`
Analog temperature sensor monitoring with alerts.
- Configures analog pin for continuous reading
- Converts ADC values to temperature
- Triggers LED alerts for high/low temperature thresholds

### `i2c-sensor-reader.js`
I2C bus communication example.
- Scans I2C bus for connected devices
- Reads/writes to I2C sensors (BME280 example)
- Demonstrates `env.DEVICE.i2cScan()`, `i2cRead()`, `i2cWrite()`

### `pwm-motor-control.js`
PWM output for motors and servos.
- DC motor speed control
- Servo angle positioning
- Demonstrates `env.DEVICE.setPwmState()`

### `button-led-toggle.js`
Digital input handling example.
- Reads button state changes
- Toggles LED on button press
- Shows pin configuration for digital input

### `gpio-input-monitor.js`
GPIO input monitoring example using the newer monitoring API.
- Enables GPIO input monitoring on a button pin
- Receives `gpio_state_changed` events when pin state changes
- Toggles LED on button press
- Demonstrates `env.DEVICE.configureGpioInputMonitoring()`

## Script Structure

Every device script must export a default class extending `WorkerEntrypoint` with at least `onMessage`:

```javascript
import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
  // REQUIRED: Called when device sends a message
  async onMessage(message) {
    // Handle messages from the device
  }

  // OPTIONAL: Called when device connects
  async onDeviceConnect() {
    // Initialize your device
  }

  // OPTIONAL: Called when device disconnects
  async onDeviceDisconnect() {
    // Cleanup
  }

  // OPTIONAL: Called when alarm fires
  async onAlarm() {
    // Handle scheduled tasks
  }

  // Optional: Add custom methods for RPC calls
  async customMethod(arg1, arg2) {
    return arg1 + arg2;
  }
}
```

**Important:** Access bindings via `this.env`, not global `env`:
- ✅ `this.env.DEVICE.setGpioState(...)`
- ✅ `this.env.logger.info(...)`
- ❌ `env.DEVICE.setGpioState(...)` (will fail with I/O context error)

## Available Bindings

Your script has access to these bindings via `env`:

### `env.DEVICE`
Send commands to the physical IoT device:

```javascript
// GPIO
await env.DEVICE.setGpioState(pin, "high" | "low");

// PWM
await env.DEVICE.setPwmState(pin, frequency, dutyCyclePercent);

// I2C
await env.DEVICE.i2cScan(bus);
await env.DEVICE.i2cWrite(bus, address, dataArray);
await env.DEVICE.i2cRead(bus, address, bytesToRead, registerAddress?);

// Pin configuration
await env.DEVICE.sendCommand({
  type: "set_pin_config",
  payload: { pin, mode, report_policy, ... }
});

// Get pin state
const result = await env.DEVICE.getPinState(pin, "analog" | "digital");

// Reboot device
await env.DEVICE.reboot();

// GPIO input monitoring (pull defaults to "up")
await env.DEVICE.configureGpioInputMonitoring(pin, true);           // enable with pull-up
await env.DEVICE.configureGpioInputMonitoring(pin, true, "down");   // enable with pull-down
await env.DEVICE.configureGpioInputMonitoring(pin, true, "none");   // enable with no pull
await env.DEVICE.configureGpioInputMonitoring(pin, false);          // disable

// KV storage (persistent across invocations)
await env.DEVICE.kv.put("myKey", { any: "value" });
const value = await env.DEVICE.kv.get("myKey");
await env.DEVICE.kv.delete("myKey");
```

### `env.logger`
Log messages (proxied to the platform logs):

```javascript
env.logger.debug("Debug message");
env.logger.info("Info message");
env.logger.log("Log message");
env.logger.warn("Warning message");
env.logger.error("Error message");
```

## Message Types

Your `onMessage` handler receives these message types:

```javascript
// Pin state update (from configured pins)
{
  type: "pin_state_update",
  payload: { pin: 26, mode: "analog", value: 2048 }
}

// I2C scan result
{
  type: "i2c_scan_result",
  payload: { bus: 0, addresses_found: ["0x76", "0x77"] }
}

// I2C read result
{
  type: "i2c_read_result",
  payload: { bus: 0, address: "0x76", data: ["0xFA", "0x12"] }
}

// Command acknowledgment
{
  type: "command_ack",
  payload: { command_type: "set_gpio_state" }
}

// Command error
{
  type: "command_error",
  payload: { command_type: "i2c_read", error: "Device not found" }
}

// GPIO state changed (from monitored pins)
{
  type: "gpio_state_changed",
  payload: { pin: 20, state: "high" }  // or "low"
}
```

## Security Notes

- Scripts run in isolated sandboxes with no network access
- Scripts can only communicate with their assigned device
- All logging is captured and available in platform logs

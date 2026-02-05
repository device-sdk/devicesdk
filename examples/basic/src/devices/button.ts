/**
 * Button LED Toggle Example
 *
 * Simple example demonstrating:
 * - GPIO input monitoring with pull-up
 * - GPIO output control
 * - KV storage for state persistence
 *
 * Wiring:
 * - Button: GP20 → GND (uses internal pull-up)
 * - LED: GP25 (onboard) or external LED with resistor
 *
 * NOTE: Always use DEVICE.kv to store state that should persist across
 * device reconnections. Class properties are lost when the device disconnects.
 */

import { DeviceEntrypoint, DeviceResponse } from "@devicesdk/core";

const BUTTON_PIN = 20;
const LED_PIN = 99;  // Onboard LED on Pico

export class MyDevice extends DeviceEntrypoint {
	// NOTE: Don't store state in class properties - use DEVICE.kv instead
	// Class properties reset when the worker restarts or device reconnects

	async onDeviceConnect() {
		this.env.LOGGER.info("Device connected");

		// Enable GPIO input monitoring on button pin with pull-up
		await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true, "up");

		// Load persisted LED state from kv (defaults to false if not set)
		const ledOn = await this.env.DEVICE.kv.get<boolean>("ledOn") ?? false;
		await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");

		this.env.LOGGER.info(`Ready! LED is ${ledOn ? "ON" : "OFF"}`);
	}

	async onDeviceDisconnect() {
		this.env.LOGGER.info("Device disconnected");
	}

	async onMessage(message: DeviceResponse) {
		// Handle button press (pin goes low with pull-up)
		if (message.type === "gpio_state_changed" &&
			message.payload.pin === BUTTON_PIN &&
			message.payload.state === "low") {

			// Read current state from kv, toggle it
			const ledOn = !(await this.env.DEVICE.kv.get<boolean>("ledOn") ?? false);

			// Persist new state to kv BEFORE updating hardware
			await this.env.DEVICE.kv.put("ledOn", ledOn);

			// Now update hardware
			await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");

			this.env.LOGGER.info(`LED toggled ${ledOn ? "ON" : "OFF"}`);
		}
	}
}

/**
 * OLED Button Counter Example
 *
 * Demonstrates:
 * - I2C configuration with type-safe Pico helper
 * - SSD1306 OLED display with drawing primitives
 * - GPIO input monitoring
 * - KV storage for state persistence
 *
 * Wiring:
 * - OLED SDA: GP0
 * - OLED SCL: GP1
 * - OLED VCC: 3V3
 * - OLED GND: GND
 * - Button: GP20 → GND (uses internal pull-up)
 * - LED: GP25 (onboard) or custom pin
 *
 * NOTE: Always use DEVICE.kv to store state that should persist across
 * device reconnections. Class properties are lost when the device disconnects.
 */

import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
import { Pico } from "@devicesdk/core/devices/pico";
import { SSD1306 } from "@devicesdk/core/i2c";

const BUTTON_PIN = 20;
const LED_PIN = 25;

export class OledButtonCounter extends DeviceEntrypoint {
	// Display instance can be a class property since it's stateless
	// (framebuffer is rebuilt each time from kv state)
	private display = new SSD1306({
		bus: 0,
		address: "0x3C",
		width: 128,
		height: 64,
	});

	// NOTE: Don't store state in class properties - use DEVICE.kv instead
	// All persistent state (ledOn, pressCount, displayInitialized) goes in kv

	async onDeviceConnect() {
		this.env.LOGGER.info("Device connected - initializing...");

		// Reset hardware-related state (device has rebooted)
		await this.env.DEVICE.kv.put("displayInitialized", false);

		// Configure I2C with type-safe pin selection
		await this.env.DEVICE.sendCommand(
			Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1, frequency: 400000 }),
		);

		// Enable button monitoring with pull-up
		await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true, "up");

		// Load persisted LED state and restore hardware state
		const ledOn = (await this.env.DEVICE.kv.get<boolean>("ledOn")) ?? false;
		await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");

		// Show initial display (reads all state from kv)
		await this.updateDisplay();

		this.env.LOGGER.info("Ready!");
	}

	async onDeviceDisconnect() {
		this.env.LOGGER.info("Device disconnected");
	}

	async onMessage(message: DeviceResponse) {
		if (
			message.type === "gpio_state_changed" &&
			message.payload.pin === BUTTON_PIN &&
			message.payload.state === "low"
		) {
			// Read current state from kv
			const ledOn = !(
				(await this.env.DEVICE.kv.get<boolean>("ledOn")) ?? false
			);
			const pressCount =
				((await this.env.DEVICE.kv.get<number>("pressCount")) ?? 0) + 1;

			// Persist new state to kv FIRST
			await this.env.DEVICE.kv.put("ledOn", ledOn);
			await this.env.DEVICE.kv.put("pressCount", pressCount);

			// Then update hardware
			await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");

			// Update display (reads state from kv)
			await this.updateDisplay();

			this.env.LOGGER.info(`LED ${ledOn ? "ON" : "OFF"}, press #${pressCount}`);
		}
	}

	private async updateDisplay() {
		// Always read state from kv - never from class properties
		const ledOn = (await this.env.DEVICE.kv.get<boolean>("ledOn")) ?? false;
		const pressCount =
			(await this.env.DEVICE.kv.get<number>("pressCount")) ?? 0;
		const displayInitialized =
			(await this.env.DEVICE.kv.get<boolean>("displayInitialized")) ?? false;

		this.display
			.clear()
			// Header
			.drawText(25, 0, "DeviceSDK")
			.drawLine(0, 10, 127, 10)
			// LED status
			.drawText(10, 18, `LED: ${ledOn ? "[*] ON" : "[ ] OFF"}`)
			// Press counter
			.drawText(10, 30, `Presses: ${pressCount}`)
			// Footer
			.drawLine(0, 44, 127, 44)
			.drawText(5, 50, `BTN:GP${BUTTON_PIN} LED:GP${LED_PIN}`);

		// Visual indicator circle (filled when LED is on)
		this.display.drawCircle(110, 24, 8, ledOn);

		// Send to display - init sequence only on first call
		await this.env.DEVICE.sendCommand(
			this.display.toDisplayCommand({ init: !displayInitialized }),
		);

		// Mark display as initialized in kv
		if (!displayInitialized) {
			await this.env.DEVICE.kv.put("displayInitialized", true);
		}
	}
}

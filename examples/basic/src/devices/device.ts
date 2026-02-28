import { DeviceEntrypoint, DeviceResponse } from "@devicesdk/core";
import { SSD1306 } from "@devicesdk/core/i2c";
import { Pico } from "@devicesdk/core/devices/pico";

// Pin configuration
const BUTTON_PIN = 20;  // GPIO pin connected to button (directly beside GP21)
const LED_PIN = 99;     // Onboard LED on Pico

// I2C OLED configuration (GP0 = SDA, GP1 = SCL)
const I2C_BUS = 0;
const OLED_ADDRESS = "0x3C";

export class MyDevice extends DeviceEntrypoint {
	private display = new SSD1306({
		bus: I2C_BUS,
		address: OLED_ADDRESS,
		width: 128,
		height: 64
	});

	async onDeviceConnect() {
		console.info("Device connected - initializing...");

		// Reset hardware-related state (device has rebooted)
		await this.env.DEVICE.kv.put("displayInitialized", false);
		await this.env.DEVICE.kv.put("ledOn", false);
		await this.env.DEVICE.kv.put("pressCount", 0);

		// Configure I2C bus with type-safe pin selection
		await this.env.DEVICE.sendCommand(
			Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1, frequency: 100000 })
		);

		// Enable GPIO input monitoring on the button pin
		await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true, "up");

		// Set LED to persisted state
		await this.env.DEVICE.setGpioState(LED_PIN, "low");

		// Show initial display
		await this.updateDisplay();

		console.info(`Ready! Press button on GP${BUTTON_PIN} to toggle LED`);
	}

	async onDeviceDisconnect() {
		console.info("Device disconnected");
	}

	async onMessage(message: DeviceResponse) {
		// Handle GPIO state change events from the device
		if (message.type === "gpio_state_changed" && message.payload.pin === BUTTON_PIN) {
			const buttonState = message.payload.state;


			// Toggle LED on button press (when pin goes low - button pressed with pull-up)
			if (buttonState === "low") {
				// Get current state from kv
				const ledOn = !(await this.env.DEVICE.kv.get<boolean>("ledOn") ?? false);
				const pressCount = (await this.env.DEVICE.kv.get<number>("pressCount") ?? 0) + 1;

				// Persist new state
				await this.env.DEVICE.kv.put("ledOn", ledOn);
				await this.env.DEVICE.kv.put("pressCount", pressCount);

				await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");
				console.info(`Button pressed! LED ${ledOn ? "ON" : "OFF"} (press #${pressCount})`);

				// Update display
				await this.updateDisplay();
			}
		}
	}

	private async updateDisplay() {
		// Read state from kv
		const ledOn = await this.env.DEVICE.kv.get<boolean>("ledOn") ?? false;
		const pressCount = await this.env.DEVICE.kv.get<number>("pressCount") ?? 0;

		const statusText = ledOn ? "ON" : "OFF";
		const statusIcon = ledOn ? "[*]" : "[ ]";

		this.display
			.clear()
			// Header
			.drawText(25, 0, "DeviceSDK")
			.drawLine(0, 10, 127, 10)
			// LED status with icon
			.drawText(10, 18, `LED: ${statusIcon} ${statusText}`)
			// Press counter
			.drawText(10, 30, `Presses: ${pressCount}`)
			// Instructions
			.drawLine(0, 44, 127, 44)
			.drawText(5, 50, `BTN:GP${BUTTON_PIN} LED:GP${LED_PIN}`);

		// // Draw a filled circle when LED is on
		if (ledOn) {
			this.display.drawCircle(110, 24, 8, true);
		} else {
			this.display.drawCircle(110, 24, 8, false);
		}

		const displayInitialized = await this.env.DEVICE.kv.get<boolean>("displayInitialized") ?? false;

		await this.env.DEVICE.sendCommand(
			this.display.toDisplayCommand({ init: !displayInitialized, compress: false })
		);

		if (!displayInitialized) {
			await this.env.DEVICE.kv.put("displayInitialized", true);
		}
	}
}

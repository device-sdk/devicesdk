// GPIO Input Monitoring Example
// This template demonstrates using GPIO input monitoring to detect button presses
// and toggle an LED. The device sends gpio_state_changed events when the pin state changes.

import { WorkerEntrypoint } from "cloudflare:workers";

const BUTTON_PIN = 20; // GPIO pin connected to button (active high)
const LED_PIN = 99; // GPIO pin connected to LED

export default class extends WorkerEntrypoint {
	async onDeviceConnect() {
		this.env.logger.info("GPIO Input Monitor connected");

		// Enable GPIO input monitoring on the button pin
		// The device will send gpio_state_changed messages when the pin changes
		await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true);

		// Initialize LED to off
		await this.env.DEVICE.setGpioState(LED_PIN, "low");
		await this.env.DEVICE.kv.put("ledOn", false);

		this.env.logger.info(`Monitoring GPIO ${BUTTON_PIN} for button presses`);
	}

	async onDeviceDisconnect() {
		this.env.logger.info("GPIO Input Monitor disconnected");
	}

	async onMessage(message) {
		// Handle GPIO state change events from the device
		if (
			message.type === "gpio_state_changed" &&
			message.payload.pin === BUTTON_PIN
		) {
			const buttonState = message.payload.state;
			this.env.logger.info(
				`Button pin ${BUTTON_PIN} changed to ${buttonState}`,
			);

			// Toggle LED on button press (when pin goes high)
			if (buttonState === "high") {
				const ledOn = !(await this.env.DEVICE.kv.get("ledOn"));
				await this.env.DEVICE.kv.put("ledOn", ledOn);
				await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");
				this.env.logger.info(`LED toggled ${ledOn ? "ON" : "OFF"}`);
			}
		}
	}
}

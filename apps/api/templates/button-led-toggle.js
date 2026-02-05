// Button LED Toggle Example
// This template demonstrates reading button input and toggling an LED
// Great for learning digital input/output interactions

import { WorkerEntrypoint } from "cloudflare:workers";

const BUTTON_PIN = 14;  // Digital input pin for button
const LED_PIN = 99;     // LED output pin

export default class extends WorkerEntrypoint {
	constructor(state, env) {
		super(state, env);
		this.ledState = false;   // Track current LED state
	}

	async onDeviceConnect() {
		this.env.logger.info("Button LED Toggle connected");
		
		// Configure button pin for digital input with change reporting
		await this.env.DEVICE.sendCommand({
			type: "set_pin_config",
			payload: {
				pin: BUTTON_PIN,
				mode: "digital",
				report_policy: "on_change",
			},
		});
		
		// Initialize LED to off
		await this.env.DEVICE.setGpioState(LED_PIN, "low");
		this.ledState = false;
		
		this.env.logger.info("Button and LED configured");
	}

	async onDeviceDisconnect() {
		this.env.logger.info("Button LED Toggle disconnected");
	}

	async onMessage(message) {
		// Handle button press (pin state change)
		if (message.type === "pin_state_update" && message.payload.pin === BUTTON_PIN) {
			const buttonPressed = message.payload.value === 1;
			
			// Toggle LED on button press (rising edge)
			if (buttonPressed) {
				this.ledState = !this.ledState;
				await this.env.DEVICE.setGpioState(LED_PIN, this.ledState ? "high" : "low");
				this.env.logger.info(`Button pressed! LED is now ${this.ledState ? "ON" : "OFF"}`);
			}
		}
	}
}

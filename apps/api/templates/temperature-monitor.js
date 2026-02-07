// Temperature Monitor Example
// This template reads temperature from an analog sensor and logs changes
// Supports sensors like TMP36, LM35, or similar analog temperature sensors

import { WorkerEntrypoint } from "cloudflare:workers";

const TEMP_SENSOR_PIN = 26; // ADC pin for temperature sensor
const ALERT_LED_PIN = 99; // LED to indicate temperature alerts
const HIGH_TEMP_THRESHOLD = 30; // Celsius
const LOW_TEMP_THRESHOLD = 10; // Celsius

// Convert ADC value to temperature (adjust formula for your sensor)
// This example assumes a TMP36 sensor with 3.3V reference
function adcToTemperature(adcValue) {
	const voltage = (adcValue / 4095) * 3.3;
	// TMP36: 10mV per degree, 500mV offset at 0°C
	return (voltage - 0.5) * 100;
}

export default class extends WorkerEntrypoint {
	async onDeviceConnect() {
		this.env.logger.info("Temperature monitor connected");

		// Configure the temperature sensor pin for analog reading
		await this.env.DEVICE.sendCommand({
			type: "set_pin_config",
			payload: {
				pin: TEMP_SENSOR_PIN,
				mode: "analog",
				report_policy: "on_change",
				report_change_threshold_percent: 2, // Report when value changes by 2%
			},
		});

		this.env.logger.info("Temperature sensor configured");
	}

	async onDeviceDisconnect() {
		this.env.logger.info("Temperature monitor disconnected");
	}

	async onMessage(message) {
		if (
			message.type === "pin_state_update" &&
			message.payload.pin === TEMP_SENSOR_PIN
		) {
			const temperature = adcToTemperature(message.payload.value);
			this.env.logger.info(`Temperature: ${temperature.toFixed(1)}°C`);

			// Check thresholds and alert
			if (temperature > HIGH_TEMP_THRESHOLD) {
				this.env.logger.warn(
					`HIGH TEMPERATURE ALERT: ${temperature.toFixed(1)}°C`,
				);
				await this.env.DEVICE.setGpioState(ALERT_LED_PIN, "high");
			} else if (temperature < LOW_TEMP_THRESHOLD) {
				this.env.logger.warn(
					`LOW TEMPERATURE ALERT: ${temperature.toFixed(1)}°C`,
				);
				await this.env.DEVICE.setGpioState(ALERT_LED_PIN, "high");
			} else {
				await this.env.DEVICE.setGpioState(ALERT_LED_PIN, "low");
			}
		}
	}
}

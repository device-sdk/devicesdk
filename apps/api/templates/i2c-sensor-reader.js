// I2C Sensor Reader Example
// This template demonstrates reading from I2C sensors
// Works with common sensors like BME280, BMP280, SHT31, etc.

import { WorkerEntrypoint } from "cloudflare:workers";

const I2C_BUS = 0;
const SENSOR_ADDRESS = "0x76"; // Common address for BME280/BMP280

// BME280 register addresses
const BME280_REG_TEMP = "0xFA";
const BME280_REG_CTRL_MEAS = "0xF4";

export default class extends WorkerEntrypoint {
	async onDeviceConnect() {
		console.info("I2C Sensor Reader connected");

		// Scan I2C bus to find connected devices
		try {
			const scanResult = await this.env.DEVICE.i2cScan(I2C_BUS);
			console.info(
				"I2C devices found:",
				scanResult.payload.addresses_found,
			);

			if (scanResult.payload.addresses_found.length === 0) {
				console.warn("No I2C devices found! Check your wiring.");
				return;
			}

			// Initialize the sensor (example for BME280)
			// Write to control register: normal mode, oversampling x1
			await this.env.DEVICE.i2cWrite(I2C_BUS, SENSOR_ADDRESS, ["0xF4", "0x27"]);
			console.info("Sensor initialized");
		} catch (error) {
			console.error("Failed to initialize I2C sensor:", error);
		}
	}

	async onDeviceDisconnect() {
		console.info("I2C Sensor Reader disconnected");
	}

	async onMessage(message) {
		console.debug("Received:", message);

		// Handle I2C read results
		if (message.type === "i2c_read_result") {
			console.info(
				`I2C data from ${message.payload.address}:`,
				message.payload.data,
			);
		}

		// Handle I2C scan results
		if (message.type === "i2c_scan_result") {
			console.info(
				"I2C scan complete. Devices:",
				message.payload.addresses_found,
			);
		}
	}

	// Helper method to read temperature (call from external trigger if needed)
	async readTemperature() {
		try {
			const result = await this.env.DEVICE.i2cRead(
				I2C_BUS,
				SENSOR_ADDRESS,
				3, // Read 3 bytes
				BME280_REG_TEMP,
			);

			// Parse BME280 temperature data (simplified)
			const data = result.payload.data;
			console.info("Raw temperature data:", data);
		} catch (error) {
			console.error("Failed to read temperature:", error);
		}
	}
}

import { describe, expect, it } from "vitest";
import {
	type DeviceSDKConfig,
	DeviceSDKConfigSchema,
	defineConfig,
} from "./config";

describe("DeviceSDKConfigSchema", () => {
	it("should validate a correct config", () => {
		const config = {
			projectId: "my-project",
			devices: {
				"temperature-sensor": {
					className: "TemperatureSensorDevice",
					main: "./devices/temperatureSensor.ts",
					deviceType: "pico-w",
					name: "Temperature Sensor",
					description: "Monitors room temperature",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("should validate config with minimal device properties", () => {
		const config = {
			projectId: "my-project",
			devices: {
				sensor: {
					className: "SensorDevice",
					main: "./devices/sensor.ts",
					deviceType: "pico2-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("should validate config with esp32 device type", () => {
		const config = {
			projectId: "my-project",
			devices: {
				"esp-sensor": {
					className: "EspDevice",
					main: "./devices/esp.ts",
					deviceType: "esp32",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("should validate config with esp32c61 device type", () => {
		const config = {
			projectId: "my-project",
			devices: {
				"esp-c61-sensor": {
					className: "EspC61Device",
					main: "./devices/espC61.ts",
					deviceType: "esp32c61",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("should validate config with esp32c3 device type", () => {
		const config = {
			projectId: "my-project",
			devices: {
				"esp-c3-sensor": {
					className: "EspC3Device",
					main: "./devices/espC3.ts",
					deviceType: "esp32c3",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("should fail validation for a config with missing projectId", () => {
		const config = {
			devices: {
				"temperature-sensor": {
					main: "./devices/temperatureSensor.ts",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("should fail validation for a config with missing className or main", () => {
		const config = {
			projectId: "my-project",
			devices: {
				"temperature-sensor": {
					name: "Temperature Sensor",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("should fail validation for invalid projectId format", () => {
		const config = {
			projectId: "Invalid_Project",
			devices: {},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("should validate a config with an empty devices object", () => {
		const config = {
			projectId: "my-project",
			devices: {},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(true);
	});

	it("defineConfig should return the config with main field", () => {
		const config: DeviceSDKConfig = {
			projectId: "my-project",
			devices: {
				sensor: {
					className: "MySensor",
					main: "./devices/sensor.ts",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = defineConfig(config);
		expect(result.devices.sensor.main).toBe("./devices/sensor.ts");
	});

	it("should fail validation when main is omitted", () => {
		const config = {
			projectId: "my-project",
			devices: {
				sensor: {
					className: "SensorDevice",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
	});

	it("should fail validation when className is a file path instead of an identifier", () => {
		const config = {
			projectId: "my-project",
			devices: {
				sensor: {
					className: "./devices/sensor.ts",
					main: "./devices/sensor.ts",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toContain(
				"'className' must be a valid TypeScript class name",
			);
		}
	});

	it("should fail validation with a migration hint when the legacy 'entrypoint' key is present", () => {
		const config = {
			projectId: "my-project",
			devices: {
				sensor: {
					entrypoint: "SensorDevice",
					main: "./devices/sensor.ts",
					deviceType: "pico-w",
					wifi: { ssid: "ssid", password: "pass" },
				},
			},
		};
		const result = DeviceSDKConfigSchema.safeParse(config);
		expect(result.success).toBe(false);
		if (!result.success) {
			const messages = result.error.issues.map((i) => i.message).join(" | ");
			expect(messages).toContain("'entrypoint' was renamed to 'className'");
		}
	});
});

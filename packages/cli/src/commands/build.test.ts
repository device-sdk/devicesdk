import fs from "node:fs/promises";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateDeviceTypes } from "./build.js";

describe("generateDeviceTypes", () => {
	let writeFileSpy: MockInstance;

	beforeEach(() => {
		writeFileSpy = vi
			.spyOn(fs, "writeFile")
			.mockImplementation(() => Promise.resolve());
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should do nothing when devices is empty", async () => {
		await generateDeviceTypes(
			{ projectId: "my-project", devices: {} },
			"/project",
		);
		expect(writeFileSpy).not.toHaveBeenCalled();
	});

	it("should generate correct content for a single device", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					"temp-sensor": {
						className: "TempSensor",
						main: "./src/devices/tempSensor.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain(
			'import type { TempSensor } from "./src/devices/tempSensor"',
		);
		expect(content).toContain('"temp-sensor": TempSensor;');
		expect(content).toContain("export type ProjectDevices");
		expect(content).toContain(
			"export type Env = UserWorkerEnv<ProjectDevices>;",
		);
	});

	it("should strip the .ts extension from import paths", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					sensor: {
						className: "MySensor",
						main: "./devices/sensor.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain('from "./devices/sensor"');
		expect(content).not.toContain("sensor.ts");
	});

	it("should add ./ prefix to import paths that lack one", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					sensor: {
						className: "MySensor",
						main: "devices/sensor.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain('from "./devices/sensor"');
	});

	it("should not add ./ prefix to paths starting with ../", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					sensor: {
						className: "MySensor",
						main: "../shared/sensor.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain('from "../shared/sensor"');
		expect(content).not.toContain('from "./../shared/sensor"');
	});

	it("should deduplicate class names using aliases", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					"device-a": {
						className: "MyDevice",
						main: "./devices/a.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
					"device-b": {
						className: "MyDevice",
						main: "./devices/b.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		// First occurrence uses the class name directly
		expect(content).toContain('import type { MyDevice } from "./devices/a"');
		// Second occurrence gets an alias
		expect(content).toContain(
			'import type { MyDevice as MyDevice_1 } from "./devices/b"',
		);
		expect(content).toContain('"device-a": MyDevice;');
		expect(content).toContain('"device-b": MyDevice_1;');
	});

	it("should handle three devices with the same class name", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					"dev-1": {
						className: "GenericDevice",
						main: "./devices/one.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
					"dev-2": {
						className: "GenericDevice",
						main: "./devices/two.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
					"dev-3": {
						className: "GenericDevice",
						main: "./devices/three.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain(
			'import type { GenericDevice } from "./devices/one"',
		);
		expect(content).toContain(
			'import type { GenericDevice as GenericDevice_1 } from "./devices/two"',
		);
		expect(content).toContain(
			'import type { GenericDevice as GenericDevice_2 } from "./devices/three"',
		);
	});

	it("should warn when main looks like a class name rather than a file path", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					sensor: {
						className: "SensorDevice",
						main: "SensorDevice",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("looks like a class name"),
		);
	});

	it("should not warn when main is a proper file path", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					sensor: {
						className: "SensorDevice",
						main: "./src/SensorDevice.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("should write the output file to configDir/devicesdk-env.d.ts", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					device: {
						className: "MyDevice",
						main: "./devices/my.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/some/custom/dir",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [outPath] = writeFileSpy.mock.calls[0] as [string, string];
		expect(outPath).toBe("/some/custom/dir/devicesdk-env.d.ts");
	});

	it("should import UserWorkerEnv from @devicesdk/core", async () => {
		await generateDeviceTypes(
			{
				projectId: "my-project",
				devices: {
					device: {
						className: "MyDevice",
						main: "./devices/my.ts",
						deviceType: "pico-w",
						wifi: { ssid: "ssid", password: "pass" },
					},
				},
			},
			"/project",
		);

		expect(writeFileSpy).toHaveBeenCalledOnce();
		const [, content] = writeFileSpy.mock.calls[0] as [string, string];
		expect(content).toContain(
			'import type { UserWorkerEnv } from "@devicesdk/core"',
		);
	});
});

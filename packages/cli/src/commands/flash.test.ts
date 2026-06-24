import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import { EXIT } from "../exitCodes.js";
import flash from "./flash.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const apiMocks = {
	getProject: vi.fn(),
	createProject: vi.fn(),
	getDevice: vi.fn(),
	createDevice: vi.fn(),
	downloadDeviceFirmware: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		getProject: apiMocks.getProject,
		createProject: apiMocks.createProject,
		getDevice: apiMocks.getDevice,
		createDevice: apiMocks.createDevice,
		downloadDeviceFirmware: apiMocks.downloadDeviceFirmware,
	};
});

function createBaseConfig() {
	return {
		projectId: "test-project",
		devices: {
			"pico-1": {
				main: "./devices/pico.ts",
				deviceType: "pico-w",
				name: "Pico One",
				description: "A pico device",
				wifi: { ssid: "ssid", password: "pass" },
			},
		},
	};
}

vi.mock("../utils.js", () => ({
	loadConfig: vi
		.fn()
		.mockImplementation(() => Promise.resolve(createBaseConfig())),
	getConfigDir: vi.fn().mockReturnValue("/project"),
}));

const flashPicoMock = vi.fn();
vi.mock("../flash/pico.js", () => ({
	flashPico: flashPicoMock,
}));

const flashEsp32Mocks = {
	flashESP32: vi.fn(),
	checkEsptoolInstalled: vi.fn(),
};
vi.mock("../flash/esp32.js", () => ({
	flashESP32: flashEsp32Mocks.flashESP32,
	checkEsptoolInstalled: flashEsp32Mocks.checkEsptoolInstalled,
}));

function createEsp32Config() {
	return {
		projectId: "test-project",
		devices: {
			"esp-1": {
				main: "./devices/esp.ts",
				deviceType: "esp32",
				name: "ESP One",
				description: "An ESP32 device",
				wifi: { ssid: "ssid", password: "pass" },
			},
		},
	};
}

function createEsp32c61Config() {
	return {
		projectId: "test-project",
		devices: {
			"esp-c61-1": {
				main: "./devices/espC61.ts",
				deviceType: "esp32c61",
				name: "ESP32-C61 One",
				description: "An ESP32-C61 device",
				wifi: { ssid: "ssid", password: "pass" },
			},
		},
	};
}

function createEsp32c3Config() {
	return {
		projectId: "test-project",
		devices: {
			"esp-c3-1": {
				main: "./devices/espC3.ts",
				deviceType: "esp32c3",
				name: "ESP32-C3 One",
				description: "An ESP32-C3 device",
				wifi: { ssid: "ssid", password: "pass" },
			},
		},
	};
}

describe("flash command", () => {
	const exitSpy = vi
		.spyOn(process, "exit")
		.mockImplementation((code?: number | string): never => {
			throw new Error(`exit:${code ?? 0}`);
		});

	const mkdirSpy = vi.spyOn(fs, "mkdir");
	const writeFileSpy = vi.spyOn(fs, "writeFile");

	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.getProject.mockResolvedValue({});
		apiMocks.createProject.mockResolvedValue({});
		apiMocks.getDevice.mockResolvedValue({});
		apiMocks.createDevice.mockResolvedValue({});
		apiMocks.downloadDeviceFirmware.mockResolvedValue(Buffer.from("fw"));
		flashPicoMock.mockResolvedValue({ mountpoint: "/Volumes/RPI-RP2" });
		flashEsp32Mocks.flashESP32.mockResolvedValue({ port: "/dev/ttyUSB0" });
		flashEsp32Mocks.checkEsptoolInstalled.mockResolvedValue(true);
		mkdirSpy.mockImplementation(async () => undefined);
		writeFileSpy.mockResolvedValue();
	});

	it("passes host option to firmware download", async () => {
		await flash("pico-1", { host: "192.168.0.1:9000" });

		expect(apiMocks.downloadDeviceFirmware).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"pico-1",
			expect.objectContaining({ ssid: "ssid", password: "pass" }),
			"pico-w",
			{ host: "192.168.0.1:9000" },
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("flashes successfully when project and device exist", async () => {
		await flash("pico-1");

		expect(apiMocks.getProject).toHaveBeenCalledWith(
			"test-token",
			"test-project",
		);
		expect(apiMocks.getDevice).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"pico-1",
		);
		expect(apiMocks.downloadDeviceFirmware).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"pico-1",
			expect.objectContaining({ ssid: "ssid", password: "pass" }),
			"pico-w",
			{ host: undefined },
		);
		expect(flashPicoMock).toHaveBeenCalledWith(
			expect.objectContaining({
				firmwarePath: expect.stringContaining("pico-1.uf2"),
			}),
		);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("creates project when missing", async () => {
		apiMocks.getProject.mockRejectedValueOnce(
			new DeviceSDKApiError("missing", 404),
		);

		await flash("pico-1");

		expect(apiMocks.createProject).toHaveBeenCalledWith(
			"test-token",
			"test-project",
		);
	});

	it("creates device when missing", async () => {
		apiMocks.getDevice.mockRejectedValueOnce(
			new DeviceSDKApiError("missing", 404),
		);

		await flash("pico-1");

		expect(apiMocks.createDevice).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"pico-1",
			"Pico One",
			"A pico device",
		);
	});

	it("exits when device is not in config", async () => {
		const { loadConfig } = await import("../utils.js");
		vi.mocked(loadConfig).mockResolvedValueOnce({
			...createBaseConfig(),
			devices: {},
		});

		await expect(flash("pico-1")).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(EXIT.CONFIG_INVALID);
	});

	it("exits when firmware download fails", async () => {
		apiMocks.downloadDeviceFirmware.mockRejectedValueOnce(
			new Error("download failed"),
		);

		await expect(flash("pico-1")).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	it("exits when flashing fails", async () => {
		flashPicoMock.mockRejectedValueOnce(new Error("flash failed"));

		await expect(flash("pico-1")).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	it("exits on non-404 project API error", async () => {
		apiMocks.getProject.mockRejectedValueOnce(
			new DeviceSDKApiError("boom", 500),
		);

		await expect(flash("pico-1")).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	// ESP32 tests
	describe("ESP32 devices", () => {
		it("routes ESP32 devices to flashESP32", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1");

			expect(flashEsp32Mocks.checkEsptoolInstalled).toHaveBeenCalled();
			expect(apiMocks.downloadDeviceFirmware).toHaveBeenCalledWith(
				"test-token",
				"test-project",
				"esp-1",
				expect.objectContaining({ ssid: "ssid", password: "pass" }),
				"esp32",
				{ host: undefined },
			);
			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({
					firmwarePath: expect.stringContaining("esp32-client.bin"),
				}),
			);
			expect(flashPicoMock).not.toHaveBeenCalled();
		});

		it("passes port option to flashESP32", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1", { port: "/dev/ttyUSB0" });

			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({ port: "/dev/ttyUSB0" }),
			);
		});

		it("passes baud option to flashESP32", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1", { baud: 115200 });

			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({ baud: 115200 }),
			);
		});

		it("exits when esptool is not installed", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());
			flashEsp32Mocks.checkEsptoolInstalled.mockResolvedValueOnce(false);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
			expect(apiMocks.downloadDeviceFirmware).not.toHaveBeenCalled();
		});

		it("exits when ESP32 firmware download fails", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());
			apiMocks.downloadDeviceFirmware.mockRejectedValueOnce(
				new Error("download failed"),
			);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
		});

		it("exits when ESP32 flashing fails", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32Config());
			flashEsp32Mocks.flashESP32.mockRejectedValueOnce(
				new Error("flash failed"),
			);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
		});
	});

	describe("ESP32-C61 devices", () => {
		it("routes esp32c61 devices to flashESP32 with correct chip name", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32c61Config());

			await flash("esp-c61-1");

			expect(flashEsp32Mocks.checkEsptoolInstalled).toHaveBeenCalled();
			expect(apiMocks.downloadDeviceFirmware).toHaveBeenCalledWith(
				"test-token",
				"test-project",
				"esp-c61-1",
				expect.objectContaining({ ssid: "ssid", password: "pass" }),
				"esp32c61",
				{ host: undefined },
			);
			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({
					firmwarePath: expect.stringContaining("esp32c61-client.bin"),
					chipName: "esp32c61",
				}),
			);
			expect(flashPicoMock).not.toHaveBeenCalled();
		});

		it("exits when esptool is not installed for esp32c61", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32c61Config());
			flashEsp32Mocks.checkEsptoolInstalled.mockResolvedValueOnce(false);

			await expect(flash("esp-c61-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
			expect(apiMocks.downloadDeviceFirmware).not.toHaveBeenCalled();
		});
	});

	describe("ESP32-C3 devices", () => {
		it("prints a tailored 'firmware not yet published' hint on FIRMWARE_NOT_PUBLISHED", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32c3Config());
			apiMocks.downloadDeviceFirmware.mockRejectedValueOnce(
				new DeviceSDKApiError(
					'Firmware for device_type "esp32c3" is not currently published.',
					404,
					"FIRMWARE_NOT_PUBLISHED",
					undefined,
					{
						success: false,
						error:
							'Firmware for device_type "esp32c3" is not currently published.',
						code: "FIRMWARE_NOT_PUBLISHED",
						device_type: "esp32c3",
					},
				),
			);
			const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			await expect(flash("esp-c3-1")).rejects.toThrowError(/exit:6/);

			const errors = errSpy.mock.calls.map((c) => String(c[0])).join("\n");
			expect(errors).toContain("Firmware for esp32c3 is not yet published");
			expect(errors).toContain("Build ESP32 from source");
			// The generic "✗ Error: Flash failed" path must NOT fire when the structured
			// hint is shown.
			expect(errors).not.toContain("Error: Flash failed");

			errSpy.mockRestore();
		});

		it("routes esp32c3 devices to flashESP32 with correct chip name", async () => {
			const { loadConfig } = await import("../utils.js");
			vi.mocked(loadConfig).mockResolvedValueOnce(createEsp32c3Config());

			await flash("esp-c3-1");

			expect(flashEsp32Mocks.checkEsptoolInstalled).toHaveBeenCalled();
			expect(apiMocks.downloadDeviceFirmware).toHaveBeenCalledWith(
				"test-token",
				"test-project",
				"esp-c3-1",
				expect.objectContaining({ ssid: "ssid", password: "pass" }),
				"esp32c3",
				{ host: undefined },
			);
			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({
					firmwarePath: expect.stringContaining("esp32c3-client.bin"),
					chipName: "esp32c3",
				}),
			);
			expect(flashPicoMock).not.toHaveBeenCalled();
		});
	});
});

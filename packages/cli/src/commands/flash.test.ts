import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
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
	downloadESP32Firmware: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		getProject: (...args: any[]) => apiMocks.getProject(...args),
		createProject: (...args: any[]) => apiMocks.createProject(...args),
		getDevice: (...args: any[]) => apiMocks.getDevice(...args),
		createDevice: (...args: any[]) => apiMocks.createDevice(...args),
		downloadDeviceFirmware: (...args: any[]) =>
			apiMocks.downloadDeviceFirmware(...args),
		downloadESP32Firmware: (...args: any[]) =>
			apiMocks.downloadESP32Firmware(...args),
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
	flashPico: (...args: any[]) => flashPicoMock(...args),
}));

const flashEsp32Mocks = {
	flashESP32: vi.fn(),
	checkEsptoolInstalled: vi.fn(),
};
vi.mock("../flash/esp32.js", () => ({
	flashESP32: (...args: any[]) => flashEsp32Mocks.flashESP32(...args),
	checkEsptoolInstalled: () => flashEsp32Mocks.checkEsptoolInstalled(),
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

describe("flash command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	const mkdirSpy = vi.spyOn(fs, "mkdir");
	const writeFileSpy = vi.spyOn(fs, "writeFile");

	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.getProject.mockResolvedValue({});
		apiMocks.createProject.mockResolvedValue({});
		apiMocks.getDevice.mockResolvedValue({});
		apiMocks.createDevice.mockResolvedValue({});
		apiMocks.downloadDeviceFirmware.mockResolvedValue(Buffer.from("fw"));
		apiMocks.downloadESP32Firmware.mockResolvedValue(Buffer.from("zipdata"));
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
		(loadConfig as any).mockResolvedValueOnce({
			...createBaseConfig(),
			devices: {},
		});

		await expect(flash("pico-1")).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(5);
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
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1");

			expect(flashEsp32Mocks.checkEsptoolInstalled).toHaveBeenCalled();
			expect(apiMocks.downloadESP32Firmware).toHaveBeenCalledWith(
				"test-token",
				"test-project",
				"esp-1",
				expect.objectContaining({ ssid: "ssid", password: "pass" }),
				"esp32",
				{ host: undefined },
			);
			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({
					firmwareZip: Buffer.from("zipdata"),
					outputDir: expect.stringContaining("esp-1"),
				}),
			);
			expect(flashPicoMock).not.toHaveBeenCalled();
		});

		it("passes port option to flashESP32", async () => {
			const { loadConfig } = await import("../utils.js");
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1", { port: "/dev/ttyUSB0" });

			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({ port: "/dev/ttyUSB0" }),
			);
		});

		it("passes baud option to flashESP32", async () => {
			const { loadConfig } = await import("../utils.js");
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());

			await flash("esp-1", { baud: 115200 });

			expect(flashEsp32Mocks.flashESP32).toHaveBeenCalledWith(
				expect.objectContaining({ baud: 115200 }),
			);
		});

		it("exits when esptool is not installed", async () => {
			const { loadConfig } = await import("../utils.js");
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());
			flashEsp32Mocks.checkEsptoolInstalled.mockResolvedValueOnce(false);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
			expect(apiMocks.downloadESP32Firmware).not.toHaveBeenCalled();
		});

		it("exits when ESP32 firmware download fails", async () => {
			const { loadConfig } = await import("../utils.js");
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());
			apiMocks.downloadESP32Firmware.mockRejectedValueOnce(
				new Error("download failed"),
			);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
		});

		it("exits when ESP32 flashing fails", async () => {
			const { loadConfig } = await import("../utils.js");
			(loadConfig as any).mockResolvedValueOnce(createEsp32Config());
			flashEsp32Mocks.flashESP32.mockRejectedValueOnce(
				new Error("flash failed"),
			);

			await expect(flash("esp-1")).rejects.toThrowError(/exit:6/);
			expect(exitSpy).toHaveBeenCalledWith(6);
		});
	});
});

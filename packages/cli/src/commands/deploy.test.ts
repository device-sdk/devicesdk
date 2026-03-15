import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import deploy from "./deploy.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const apiMocks = {
	getProject: vi.fn(),
	createProject: vi.fn(),
	uploadScript: vi.fn(),
	uploadScriptsBatch: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		getProject: (...args: any[]) => apiMocks.getProject(...args),
		createProject: (...args: any[]) => apiMocks.createProject(...args),
		uploadScript: (...args: any[]) => apiMocks.uploadScript(...args),
		uploadScriptsBatch: (...args: any[]) =>
			apiMocks.uploadScriptsBatch(...args),
	};
});

function createSingleDeviceConfig() {
	return {
		projectId: "test-project",
		devices: {
			"sensor-1": {
				main: "./devices/sensor.ts",
				name: "Sensor One",
				description: "A sensor device",
			},
		},
	};
}

function createMultiDeviceConfig() {
	return {
		projectId: "test-project",
		devices: {
			"sensor-1": {
				main: "./devices/sensor.ts",
				name: "Sensor One",
				description: "A sensor device",
			},
			"actuator-1": {
				main: "./devices/actuator.ts",
				name: "Actuator One",
				description: "An actuator device",
				entrypoint: "ActuatorOneDevice",
			},
		},
	};
}

vi.mock("../utils.js", () => ({
	loadConfig: vi
		.fn()
		.mockImplementation(() => Promise.resolve(createSingleDeviceConfig())),
	getConfigDir: vi.fn().mockReturnValue("/project"),
}));

const buildDeviceMock = vi.fn();
vi.mock("./build.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("./build.js")>();
	return {
		...original,
		buildDevice: (...args: any[]) => buildDeviceMock(...args),
	};
});

describe("deploy command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	const mkdirSpy = vi.spyOn(fs, "mkdir");
	const accessSpy = vi.spyOn(fs, "access");
	const readFileSpy = vi.spyOn(fs, "readFile");

	const defaultUploadScriptResult = {
		version_id: "v1",
		device_id: "sensor-1",
		message: null,
		created_at: 1000000,
		device_rebooted: false,
		reboot_reason: "Script unchanged",
	};

	const defaultBatchUploadResult = {
		versions: [
			{
				device_id: "sensor-1",
				version_id: "v1",
				status: "created" as const,
				device_rebooted: false,
				reboot_reason: "Script unchanged",
			},
			{
				device_id: "actuator-1",
				version_id: "v2",
				status: "created" as const,
				device_rebooted: false,
				reboot_reason: "Script unchanged",
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.getProject.mockResolvedValue({});
		apiMocks.createProject.mockResolvedValue({});
		apiMocks.uploadScript.mockResolvedValue(defaultUploadScriptResult);
		apiMocks.uploadScriptsBatch.mockResolvedValue(defaultBatchUploadResult);
		buildDeviceMock.mockResolvedValue({
			size: 1024,
			outfile: "/project/.devicesdk/build/sensor-1.js",
		});
		mkdirSpy.mockImplementation(async () => undefined);
		accessSpy.mockResolvedValue(undefined);
		readFileSpy.mockResolvedValue("const x = 1;" as any);
	});

	afterEach(() => {});

	it("deploys a single device successfully using uploadScript", async () => {
		await deploy({ device: "sensor-1" });

		expect(apiMocks.uploadScript).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"sensor-1",
			"const x = 1;",
			undefined,
			undefined,
		);
		expect(apiMocks.uploadScriptsBatch).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("exits when config has no devices", async () => {
		const { loadConfig } = await import("../utils.js");
		(loadConfig as any).mockResolvedValueOnce({
			projectId: "test-project",
			devices: {},
		});

		await expect(deploy()).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(5);
	});

	it("deploys all devices in batch when no device filter is specified", async () => {
		const { loadConfig } = await import("../utils.js");
		(loadConfig as any).mockResolvedValueOnce(createMultiDeviceConfig());
		buildDeviceMock
			.mockResolvedValueOnce({
				size: 1024,
				outfile: "/project/.devicesdk/build/sensor-1.js",
			})
			.mockResolvedValueOnce({
				size: 512,
				outfile: "/project/.devicesdk/build/actuator-1.js",
			});

		await deploy();

		expect(apiMocks.uploadScriptsBatch).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			expect.objectContaining({
				"sensor-1": expect.objectContaining({ script: "const x = 1;" }),
				"actuator-1": expect.objectContaining({
					script: "const x = 1;",
					entrypoint: "ActuatorOneDevice",
				}),
			}),
			undefined,
		);
		expect(apiMocks.uploadScript).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("creates project when it does not exist", async () => {
		apiMocks.getProject.mockRejectedValueOnce(
			new DeviceSDKApiError("not found", 404),
		);

		await deploy({ device: "sensor-1" });

		expect(apiMocks.createProject).toHaveBeenCalledWith(
			"test-token",
			"test-project",
		);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("exits when specified device is not in config", async () => {
		await expect(deploy({ device: "non-existent" })).rejects.toThrowError(
			/exit:6/,
		);
		expect(exitSpy).toHaveBeenCalledWith(5);
	});

	it("exits when main file does not exist", async () => {
		accessSpy.mockRejectedValueOnce(new Error("ENOENT: no such file"));

		await expect(deploy({ device: "sensor-1" })).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(5);
	});

	it("exits when build fails", async () => {
		buildDeviceMock.mockRejectedValueOnce(new Error("esbuild error"));

		await expect(deploy({ device: "sensor-1" })).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(5);
	});

	it("exits when createProject fails", async () => {
		apiMocks.getProject.mockRejectedValueOnce(
			new DeviceSDKApiError("not found", 404),
		);
		apiMocks.createProject.mockRejectedValueOnce(
			new DeviceSDKApiError("forbidden", 403),
		);

		await expect(deploy({ device: "sensor-1" })).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	it("skips upload during dry run", async () => {
		await deploy({ device: "sensor-1", dryRun: true });

		expect(apiMocks.uploadScript).not.toHaveBeenCalled();
		expect(apiMocks.uploadScriptsBatch).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("passes message option to uploadScript", async () => {
		await deploy({ device: "sensor-1", message: "bump version" });

		expect(apiMocks.uploadScript).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"sensor-1",
			"const x = 1;",
			"bump version",
			undefined,
		);
	});

	it("passes message option to uploadScriptsBatch", async () => {
		await deploy({ message: "batch deploy" });

		expect(apiMocks.uploadScriptsBatch).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			expect.any(Object),
			"batch deploy",
		);
	});

	it("exits on non-404 project API error", async () => {
		apiMocks.getProject.mockRejectedValueOnce(
			new DeviceSDKApiError("server error", 500),
		);

		await expect(deploy({ device: "sensor-1" })).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	it("exits when uploadScript fails", async () => {
		apiMocks.uploadScript.mockRejectedValueOnce(
			new DeviceSDKApiError("upload failed", 500),
		);

		await expect(deploy({ device: "sensor-1" })).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});

	it("exits when uploadScriptsBatch fails", async () => {
		const { loadConfig } = await import("../utils.js");
		(loadConfig as any).mockResolvedValueOnce(createMultiDeviceConfig());
		buildDeviceMock
			.mockResolvedValueOnce({
				size: 1024,
				outfile: "/project/.devicesdk/build/sensor-1.js",
			})
			.mockResolvedValueOnce({
				size: 512,
				outfile: "/project/.devicesdk/build/actuator-1.js",
			});
		apiMocks.uploadScriptsBatch.mockRejectedValueOnce(
			new DeviceSDKApiError("batch upload failed", 500),
		);

		await expect(deploy()).rejects.toThrowError(/exit:6/);
		expect(exitSpy).toHaveBeenCalledWith(6);
	});
});

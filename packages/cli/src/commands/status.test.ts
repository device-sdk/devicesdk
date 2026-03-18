import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import status from "./status.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const apiMocks = {
	listDevices: vi.fn(),
	getDeviceStatus: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		listDevices: (...args: any[]) => apiMocks.listDevices(...args),
		getDeviceStatus: (...args: any[]) => apiMocks.getDeviceStatus(...args),
	};
});

vi.mock("../utils.js", () => ({
	loadConfig: vi.fn().mockResolvedValue({ projectId: "test-project" }),
}));

function makeDevice(deviceId: string) {
	return { device_id: deviceId, name: deviceId };
}

function makeStatus(
	overrides: Partial<import("../api.js").DeviceStatus> = {},
): import("../api.js").DeviceStatus {
	return {
		connected: false,
		connected_since: null,
		last_connected_at: null,
		current_version_id: null,
		...overrides,
	};
}

describe("status command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const consoleErrorSpy = vi
		.spyOn(console, "error")
		.mockImplementation(() => {});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("reads projectId from config when no --project flag", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(makeStatus());

		await status({});

		expect(apiMocks.listDevices).toHaveBeenCalledWith(
			"test-token",
			"test-project",
		);
	});

	it("uses --project flag override instead of config", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(makeStatus());

		await status({ project: "override-project" });

		expect(apiMocks.listDevices).toHaveBeenCalledWith(
			"test-token",
			"override-project",
		);
	});

	it("prints 'No devices found' when project has no devices", async () => {
		apiMocks.listDevices.mockResolvedValue([]);

		await expect(status({})).resolves.toBeUndefined();
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("No devices found"),
		);
	});

	it("renders offline device correctly", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(
			makeStatus({
				connected: false,
				last_connected_at: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
				current_version_id: "abcdef1234567890",
			}),
		);

		await status({});

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("○ offline");
		expect(output).toContain("abcdef12"); // first 8 chars of version
		expect(output).toContain("sensor-1");
		expect(output).toMatch(/\d+h ago/); // formatRelativeTime: 2h ago
	});

	it("renders online device with connectedSince", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(
			makeStatus({
				connected: true,
				connected_since: Date.now() - 3 * 60 * 1000, // 3m ago
				current_version_id: "abcdef1234567890",
			}),
		);

		await status({});

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("● online");
		expect(output).toMatch(/connected \d+m ago/); // formatRelativeTime: "connected 3m ago"
	});

	it("renders recently connected device with seconds format", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(
			makeStatus({
				connected: true,
				connected_since: Date.now() - 30 * 1000, // 30s ago
				current_version_id: "abcdef1234567890",
			}),
		);

		await status({});

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("● online");
		expect(output).toMatch(/connected \d+s ago/); // formatRelativeTime: "connected 30s ago"
	});

	it("renders — for device with no version", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);
		apiMocks.getDeviceStatus.mockResolvedValue(
			makeStatus({ connected: false }),
		);

		await status({});

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("—");
		expect(output).toContain("never");
	});

	it("filters by --device flag", async () => {
		apiMocks.listDevices.mockResolvedValue([
			makeDevice("sensor-1"),
			makeDevice("sensor-2"),
		]);
		apiMocks.getDeviceStatus.mockResolvedValue(makeStatus());

		await status({ device: "sensor-1" });

		expect(apiMocks.getDeviceStatus).toHaveBeenCalledTimes(1);
		expect(apiMocks.getDeviceStatus).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"sensor-1",
		);
	});

	it("exits 1 when --device flag specifies unknown device", async () => {
		apiMocks.listDevices.mockResolvedValue([makeDevice("sensor-1")]);

		await expect(status({ device: "unknown" })).rejects.toThrowError(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("exits 1 when project is not found (404)", async () => {
		apiMocks.listDevices.mockRejectedValueOnce(
			new DeviceSDKApiError("not found", 404),
		);

		await expect(status({})).rejects.toThrowError(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("not found"),
		);
	});

	it("exits 1 on generic API error", async () => {
		apiMocks.listDevices.mockRejectedValueOnce(
			new DeviceSDKApiError("server error", 500),
		);

		await expect(status({})).rejects.toThrowError(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("fetches status for all devices in parallel", async () => {
		const devices = [
			makeDevice("device-a"),
			makeDevice("device-b"),
			makeDevice("device-c"),
		];
		apiMocks.listDevices.mockResolvedValue(devices);
		apiMocks.getDeviceStatus.mockResolvedValue(makeStatus());

		await status({});

		expect(apiMocks.getDeviceStatus).toHaveBeenCalledTimes(3);
	});

	it("shows error indicator for failed status fetch, online for successful", async () => {
		apiMocks.listDevices.mockResolvedValue([
			makeDevice("device-a"),
			makeDevice("device-b"),
		]);
		apiMocks.getDeviceStatus
			.mockResolvedValueOnce(
				makeStatus({ connected: true, connected_since: Date.now() }),
			)
			.mockRejectedValueOnce(new DeviceSDKApiError("timeout", 503));

		await status({});

		const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("● online");
		expect(output).toContain("⚠ error");
	});
});

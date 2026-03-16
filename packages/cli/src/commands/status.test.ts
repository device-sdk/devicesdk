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
	loadConfig: vi
		.fn()
		.mockImplementation(() =>
			Promise.resolve({ projectId: "test-project", devices: {} }),
		),
}));

// Capture console output for assertions
let consoleOutput: string[] = [];
let consoleErrors: string[] = [];
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	consoleOutput = [];
	consoleErrors = [];
	consoleLogSpy = vi
		.spyOn(console, "log")
		.mockImplementation((...args: any[]) => {
			consoleOutput.push(args.join(" "));
		});
	consoleErrorSpy = vi
		.spyOn(console, "error")
		.mockImplementation((...args: any[]) => {
			consoleErrors.push(args.join(" "));
		});
});

afterEach(() => {
	consoleLogSpy.mockRestore();
	consoleErrorSpy.mockRestore();
	vi.clearAllMocks();
});

describe("status command — no devices", () => {
	it("prints 'No devices found' and returns cleanly when no devices exist", async () => {
		apiMocks.listDevices.mockResolvedValue([]);

		await expect(status()).resolves.toBeUndefined();

		expect(
			consoleOutput.some((line) => line.includes("No devices found")),
		).toBe(true);
	});

	it("does not call getDeviceStatus when no devices exist", async () => {
		apiMocks.listDevices.mockResolvedValue([]);
		await status();
		expect(apiMocks.getDeviceStatus).not.toHaveBeenCalled();
	});
});

describe("status command — device listing", () => {
	it("prints the project ID header", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-1" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: null,
		});

		await status();

		expect(consoleOutput.some((line) => line.includes("test-project"))).toBe(
			true,
		);
	});

	it("shows offline status for a disconnected device", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-1" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: null,
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("offline");
		expect(rows).toContain("device-1");
	});

	it("shows online status for a connected device", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-2" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: true,
			connected_since: Date.now() - 5_000,
			last_connected_at: null,
			current_version_id: "abc123def456",
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("online");
		expect(rows).toContain("device-2");
		expect(rows).toContain("abc123de"); // truncated to 8 chars
	});

	it("shows version truncated to 8 chars", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-3" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: "aabbccdd1122334455",
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("aabbccdd");
		expect(rows).not.toContain("aabbccdd1122334455");
	});

	it("shows — for null version", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-4" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: null,
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("—");
	});
});

describe("status command — device filtering", () => {
	it("filters to only the requested device", async () => {
		apiMocks.listDevices.mockResolvedValue([
			{ device_id: "device-a" },
			{ device_id: "device-b" },
		]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: null,
		});

		await status({ device: "device-a" });

		expect(apiMocks.getDeviceStatus).toHaveBeenCalledTimes(1);
		expect(apiMocks.getDeviceStatus).toHaveBeenCalledWith(
			"test-token",
			"test-project",
			"device-a",
		);
	});

	it("exits with error when filtered device not found", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-a" }]);

		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});

		await expect(status({ device: "nonexistent" })).rejects.toThrow(
			"process.exit called",
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrors.some((line) => line.includes("nonexistent"))).toBe(
			true,
		);

		exitSpy.mockRestore();
	});
});

describe("status command — error rows", () => {
	it("shows error row for a device whose status fetch failed", async () => {
		apiMocks.listDevices.mockResolvedValue([
			{ device_id: "device-ok" },
			{ device_id: "device-fail" },
		]);
		apiMocks.getDeviceStatus
			.mockResolvedValueOnce({
				connected: false,
				connected_since: null,
				last_connected_at: null,
				current_version_id: null,
			})
			.mockRejectedValueOnce(new Error("network error"));

		// Should not throw
		await expect(status()).resolves.toBeUndefined();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("device-ok");
		expect(rows).toContain("device-fail");
		expect(rows).toContain("error");
	});

	it("still shows successful devices when one fails", async () => {
		apiMocks.listDevices.mockResolvedValue([
			{ device_id: "device-good" },
			{ device_id: "device-bad" },
		]);
		apiMocks.getDeviceStatus
			.mockResolvedValueOnce({
				connected: true,
				connected_since: Date.now() - 1000,
				last_connected_at: null,
				current_version_id: "v1v1v1v1",
			})
			.mockRejectedValueOnce(new Error("timeout"));

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("online");
		expect(rows).toContain("device-good");
		expect(rows).toContain("device-bad");
	});
});

describe("status command — formatRelativeTime", () => {
	it("shows last_connected_at as relative time for offline device", async () => {
		const fiveMinutesAgo = Date.now() - 5 * 60_000;
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-1" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: fiveMinutesAgo,
			current_version_id: null,
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toMatch(/\d+m ago/);
	});

	it("shows 'never' for a device that has never connected", async () => {
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-1" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: false,
			connected_since: null,
			last_connected_at: null,
			current_version_id: null,
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toContain("never");
	});

	it("shows 'connected Xs ago' for a freshly connected device", async () => {
		const connectedSince = Date.now() - 3_000; // 3 seconds ago
		apiMocks.listDevices.mockResolvedValue([{ device_id: "device-1" }]);
		apiMocks.getDeviceStatus.mockResolvedValue({
			connected: true,
			connected_since: connectedSince,
			last_connected_at: null,
			current_version_id: null,
		});

		await status();

		const rows = consoleOutput.join("\n");
		expect(rows).toMatch(/connected \d+s ago/);
	});
});

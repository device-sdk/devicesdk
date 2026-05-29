import { describe, expect, it, vi } from "vitest";
import {
	recordCommandRpc,
	recordDeviceUsage,
	recordScriptInit,
	recordWorkerLoaderFailure,
} from "../../src/foundation/analytics";

describe("analytics module", () => {
	describe("safety with undefined binding", () => {
		it("recordCommandRpc is a no-op when analytics is undefined", () => {
			expect(() =>
				recordCommandRpc(undefined, {
					commandType: "set_gpio_state",
					outcome: "ack",
					latencyMs: 12,
					ackReceived: true,
				}),
			).not.toThrow();
		});

		it("recordScriptInit is a no-op when analytics is undefined", () => {
			expect(() =>
				recordScriptInit(undefined, {
					source: "runtime",
					initLatencyMs: 250,
				}),
			).not.toThrow();
		});

		it("recordWorkerLoaderFailure is a no-op when analytics is undefined", () => {
			expect(() =>
				recordWorkerLoaderFailure(undefined, {
					failureKind: "transient",
					attemptCount: 2,
				}),
			).not.toThrow();
		});

		it("recordDeviceUsage is a no-op when the usage binding is undefined", () => {
			expect(() =>
				recordDeviceUsage(undefined, {
					deviceId: "dev-1",
					projectId: "proj-1",
					kind: "message_in",
					messagesIn: 1,
				}),
			).not.toThrow();
		});
	});

	describe("when binding is provided", () => {
		it("recordCommandRpc emits a single data point with the right shape", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			recordCommandRpc(stub, {
				commandType: "i2c_write",
				outcome: "ack",
				latencyMs: 42,
				ackReceived: true,
				deviceId: "dev-1",
				projectId: "proj-1",
			});
			expect(writeDataPoint).toHaveBeenCalledTimes(1);
			const call = writeDataPoint.mock.calls[0][0];
			expect(call.indexes).toEqual(["command_rpc"]);
			expect(call.blobs).toEqual(["dev-1", "proj-1", "i2c_write", "ack"]);
			expect(call.doubles).toEqual([42, 1]);
		});

		it("recordScriptInit indexes by 'script_init' and includes source in blobs", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			recordScriptInit(stub, {
				source: "validator",
				initLatencyMs: 1234,
			});
			const call = writeDataPoint.mock.calls[0][0];
			expect(call.indexes).toEqual(["script_init"]);
			expect(call.blobs[3]).toBe("validator");
			expect(call.doubles).toEqual([1234]);
		});

		it("recordWorkerLoaderFailure puts failureKind in blobs[2]", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			recordWorkerLoaderFailure(stub, {
				failureKind: "validator_timeout",
				errorName: "Error",
				attemptCount: 1,
			});
			const call = writeDataPoint.mock.calls[0][0];
			expect(call.indexes).toEqual(["loader_failure"]);
			expect(call.blobs[2]).toBe("validator_timeout");
			expect(call.blobs[3]).toBe("Error");
			expect(call.doubles).toEqual([1]);
		});

		it("recordDeviceUsage indexes by deviceId with the fixed usage layout", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			recordDeviceUsage(stub, {
				deviceId: "dev-1",
				projectId: "proj-1",
				userId: "user-1",
				kind: "message_in",
				messagesIn: 1,
				bytesIn: 256,
			});
			expect(writeDataPoint).toHaveBeenCalledTimes(1);
			const call = writeDataPoint.mock.calls[0][0];
			// indexes[0] = deviceId so per-device queries are a fast index lookup.
			expect(call.indexes).toEqual(["dev-1"]);
			expect(call.blobs).toEqual(["proj-1", "user-1", "message_in"]);
			// doubles: [messagesIn, messagesOut, bytesIn, bytesOut, cronFires, connectedSeconds]
			expect(call.doubles).toEqual([1, 0, 256, 0, 0, 0]);
		});

		it("recordDeviceUsage records outbound, cron, and connection kinds in the right columns", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;

			recordDeviceUsage(stub, {
				deviceId: "dev-2",
				projectId: "proj-1",
				kind: "message_out",
				messagesOut: 1,
				bytesOut: 64,
			});
			recordDeviceUsage(stub, {
				deviceId: "dev-2",
				projectId: "proj-1",
				kind: "cron_fire",
				cronFires: 3,
			});
			recordDeviceUsage(stub, {
				deviceId: "dev-2",
				projectId: "proj-1",
				kind: "connection",
				connectedSeconds: 3600,
			});

			expect(writeDataPoint.mock.calls[0][0].doubles).toEqual([
				0, 1, 0, 64, 0, 0,
			]);
			expect(writeDataPoint.mock.calls[1][0].doubles).toEqual([
				0, 0, 0, 0, 3, 0,
			]);
			expect(writeDataPoint.mock.calls[2][0].doubles).toEqual([
				0, 0, 0, 0, 0, 3600,
			]);
			// userId omitted → empty blob, never undefined.
			expect(writeDataPoint.mock.calls[0][0].blobs[1]).toBe("");
		});

		it("recordDeviceUsage skips the write when deviceId is empty", () => {
			const writeDataPoint = vi.fn();
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			recordDeviceUsage(stub, {
				deviceId: "",
				projectId: "proj-1",
				kind: "message_in",
				messagesIn: 1,
			});
			expect(writeDataPoint).not.toHaveBeenCalled();
		});

		it("swallows writeDataPoint errors so analytics never breaks the request", () => {
			const writeDataPoint = vi.fn(() => {
				throw new Error("AE quota exceeded");
			});
			const stub = { writeDataPoint } as unknown as AnalyticsEngineDataset;
			expect(() =>
				recordCommandRpc(stub, {
					commandType: "reboot",
					outcome: "fire_and_forget",
					latencyMs: 0,
					ackReceived: false,
				}),
			).not.toThrow();
		});
	});
});

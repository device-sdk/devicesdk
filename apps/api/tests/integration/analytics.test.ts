import { describe, expect, it, vi } from "vitest";
import {
	recordCommandRpc,
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

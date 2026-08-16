import {
	DeviceEntrypoint,
	type DeviceSenderInterface,
	type EnvVarsInterface,
	type UserWorkerEnv,
} from "@devicesdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeviceBridge } from "./deviceBridge.js";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		ctx: unknown;
		env: unknown;
		constructor(ctx: unknown, env: unknown) {
			this.ctx = ctx;
			this.env = env;
		}
	},
}));

const envStub: UserWorkerEnv = {
	DEVICE: {} as DeviceSenderInterface,
	DEVICES: {},
	VARS: {
		get: async () => undefined,
		getAll: async () => ({}),
	},
};

const mockCtx = {
	storage: {
		get: vi.fn().mockResolvedValue(undefined),
		put: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(true),
	},
	acceptWebSocket: vi.fn(),
};

class CronDevice extends DeviceEntrypoint {
	crons = { hourly: "0 * * * *" };
	onCronCalls: string[] = [];
	async onCron(name: string): Promise<void> {
		this.onCronCalls.push(name);
	}
}

class SlowCronDevice extends DeviceEntrypoint {
	// Fires every minute so the guard (not cron matching) is what skips.
	crons = { everyMinute: "* * * * *" };
	onCronCalls: string[] = [];
	gate?: Promise<void>;
	async onCron(name: string): Promise<void> {
		this.onCronCalls.push(name);
		if (this.gate) await this.gate;
	}
}

class BadCronDevice extends DeviceEntrypoint {
	crons = { bad: "not a cron" };
	onCronCalls: string[] = [];
	async onCron(name: string): Promise<void> {
		this.onCronCalls.push(name);
	}
}

class PlainDevice extends DeviceEntrypoint {}

type BridgeClass = ReturnType<typeof createDeviceBridge>;

// The dev worker's DO env as workerd exposes it: one text binding per CLI
// env var (name = env var name) plus the keys-list marker binding. Tests
// mock this object directly - they must not depend on Node's process.env
// shape, which differs from workerd's.
const VARS_BINDING: Record<string, string> = {
	DEVICESDK_VARS_KEYS: JSON.stringify(["FOO", "CUSTOM"]),
	FOO: "bar",
	CUSTOM: "value",
};

function makeBridge(
	DeviceClass: Parameters<typeof createDeviceBridge>[0],
	env: Record<string, string> = VARS_BINDING,
) {
	return new (createDeviceBridge(DeviceClass) as BridgeClass)(
		mockCtx as never,
		env,
	);
}

describe("device bridge", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("injects VARS from the per-var workerd text bindings into the user device env", async () => {
		const bridge = makeBridge(
			PlainDevice as unknown as Parameters<typeof createDeviceBridge>[0],
		);
		const ws = { readyState: 1 } as unknown as WebSocket;

		try {
			await bridge._initDevice(ws);

			const vars = bridge.userDevice?.env.VARS as EnvVarsInterface;
			expect(await vars.get("FOO")).toBe("bar");
			expect(await vars.get("CUSTOM")).toBe("value");
			expect(await vars.getAll()).toEqual({ FOO: "bar", CUSTOM: "value" });
		} finally {
			// Stop the cron ticker started by _initDevice so the test process
			// does not stay alive.
			await bridge._cleanup();
		}
	});

	it("serves an empty VARS when no binding was generated", async () => {
		const bridge = makeBridge(
			PlainDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			{},
		);
		const ws = { readyState: 1 } as unknown as WebSocket;

		try {
			await bridge._initDevice(ws);

			const vars = bridge.userDevice?.env.VARS as EnvVarsInterface;
			expect(await vars.get("FOO")).toBeUndefined();
			expect(await vars.getAll()).toEqual({});
		} finally {
			await bridge._cleanup();
		}
	});

	it("serves an empty VARS when the keys-list binding is malformed", async () => {
		const bridge = makeBridge(
			PlainDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			{ DEVICESDK_VARS_KEYS: "not json", FOO: "bar" },
		);
		const ws = { readyState: 1 } as unknown as WebSocket;

		try {
			await bridge._initDevice(ws);

			const vars = bridge.userDevice?.env.VARS as EnvVarsInterface;
			expect(await vars.get("FOO")).toBeUndefined();
			expect(await vars.getAll()).toEqual({});
		} finally {
			await bridge._cleanup();
		}
	});

	it("returns a snapshot from getAll so callers cannot mutate VARS", async () => {
		const bridge = makeBridge(
			PlainDevice as unknown as Parameters<typeof createDeviceBridge>[0],
		);
		const ws = { readyState: 1 } as unknown as WebSocket;

		try {
			await bridge._initDevice(ws);

			const vars = bridge.userDevice?.env.VARS as EnvVarsInterface;
			const snapshot = await vars.getAll();
			snapshot.FOO = "mutated";
			expect(await vars.get("FOO")).toBe("bar");
		} finally {
			await bridge._cleanup();
		}
	});

	describe("cron dispatch", () => {
		it("fires onCron once per matching minute and skips non-matching minutes", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-08-08T10:00:00Z"));
			const device = new CronDevice({}, envStub);
			const bridge = makeBridge(
				CronDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			);
			bridge.userDevice = device;
			bridge.startCronTicker();

			// Two ticks inside the 10:00 minute - exactly one fire.
			await vi.advanceTimersByTimeAsync(2_500);
			expect(device.onCronCalls).toEqual(["hourly"]);

			// Minutes in between are skipped, never caught up; the 11:00 slot
			// fires.
			await vi.advanceTimersByTimeAsync(3_600_000);
			expect(device.onCronCalls).toEqual(["hourly", "hourly"]);
		});

		it("does not overlap a long-running onCron with the next minute's fire", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-08-08T10:00:00Z"));
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const device = new SlowCronDevice({}, envStub);
			device.gate = gate;
			const bridge = makeBridge(
				SlowCronDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			);
			bridge.userDevice = device;
			bridge.startCronTicker();

			// 10:00 fires and hangs on the gate.
			await vi.advanceTimersByTimeAsync(2_500);
			expect(device.onCronCalls).toEqual(["everyMinute"]);

			// 10:01 matches again, but the previous onCron is still running:
			// the in-flight guard must skip it instead of overlapping.
			await vi.advanceTimersByTimeAsync(60_000);
			expect(device.onCronCalls).toEqual(["everyMinute"]);

			// Release the gate; the next tick fires again now that it's idle.
			release();
			await vi.advanceTimersByTimeAsync(1_000);
			expect(device.onCronCalls).toEqual(["everyMinute", "everyMinute"]);

			await bridge._cleanup();
		});

		it("does not fire when the current minute does not match", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-08-08T10:30:00Z"));
			const device = new CronDevice({}, envStub);
			const bridge = makeBridge(
				CronDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			);
			bridge.userDevice = device;
			bridge.startCronTicker();

			await vi.advanceTimersByTimeAsync(2_500);
			expect(device.onCronCalls).toEqual([]);
		});

		it("ignores invalid cron expressions instead of crashing the tick", async () => {
			const device = new BadCronDevice({}, envStub);
			const bridge = makeBridge(
				BadCronDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			);
			bridge.userDevice = device;

			await bridge.tickCrons();
			expect(device.onCronCalls).toEqual([]);
		});

		it("clears the ticker on cleanup", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.setSystemTime(new Date("2026-08-08T10:00:00Z"));
			const device = new CronDevice({}, envStub);
			const bridge = makeBridge(
				CronDevice as unknown as Parameters<typeof createDeviceBridge>[0],
			);
			bridge.userDevice = device;
			bridge.startCronTicker();

			await bridge._cleanup();
			await vi.advanceTimersByTimeAsync(3_600_000);
			expect(device.onCronCalls).toEqual([]);
		});
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger BEFORE importing the queue so the queue picks up our mock.
// Asserting against logger.error proves the security-fix contract (operators
// see dropped events) without spinning up the Cloudflare Workers runtime.
// logger.error itself wraps Sentry.captureException — that wrapper is a
// 1-liner with no branching, so trusting it is fine here.
vi.mock("../../src/foundation/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

const { logger } = await import("../../src/foundation/logger");
const {
	drainPendingUserWorkerEvents,
	enqueueUserWorkerEvent,
	PENDING_USER_EVENTS_KEY,
	MAX_USER_EVENT_ATTEMPTS,
	MAX_DRAIN_BATCH,
	MAX_PENDING_EVENTS,
} = await import("../../src/durableObjects/lib/userEventQueue");

// Minimal in-memory DurableObjectStorage shim — only the methods the queue
// touches. Returns whatever was put, persists across calls, and tracks the
// armed alarm so the test can verify backoff behavior.
function makeStorage(seed: Record<string, unknown> = {}) {
	const data = new Map<string, unknown>(Object.entries(seed));
	let alarm: number | null = null;
	return {
		data,
		get alarm() {
			return alarm;
		},
		set alarm(v: number | null) {
			alarm = v;
		},
		async get<T>(key: string): Promise<T | undefined> {
			return data.get(key) as T | undefined;
		},
		async put<T>(key: string, value: T): Promise<void> {
			data.set(key, value);
		},
		async delete(key: string): Promise<boolean> {
			return data.delete(key);
		},
		async getAlarm(): Promise<number | null> {
			return alarm;
		},
		async setAlarm(ms: number): Promise<void> {
			alarm = ms;
		},
	} as unknown as DurableObjectStorage & {
		data: Map<string, unknown>;
		alarm: number | null;
	};
}

const deviceMeta = {
	userId: "u-1",
	projectId: "p-1",
	deviceId: "d-1",
	versionId: "v-1",
};

describe("drainPendingUserWorkerEvents — logger.error on drop", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("calls logger.error with context when worker init throws a persistent error", async () => {
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [
				{ kind: "connect" },
				{ kind: "message", message: { id: "m", type: "ping", payload: {} } },
			],
		});

		const persistent = new SyntaxError("Unexpected reserved word");

		await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => {
				throw persistent;
			},
			initializeCrons: async () => {},
			deviceMeta,
		});

		expect(logger.error).toHaveBeenCalledOnce();
		const [errArg, msgArg, ctxArg] = vi.mocked(logger.error).mock.calls[0];
		expect(errArg).toBe(persistent);
		expect(msgArg).toContain("persistent failure");
		expect(ctxArg).toMatchObject({
			droppedCount: 2,
			kinds: ["connect", "message"],
			userId: "u-1",
			projectId: "p-1",
			deviceId: "d-1",
			versionId: "v-1",
		});
	});

	it("calls logger.error when transient retries hit MAX_USER_EVENT_ATTEMPTS", async () => {
		// Seed events at one attempt below the cap so the next failure tips them
		// past the threshold and the drain drops the batch.
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [
				{ kind: "connect", attempts: MAX_USER_EVENT_ATTEMPTS - 1 },
			],
		});

		const transient = new Error(
			"Too many concurrent dynamic workers — try again later",
		);

		await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => {
				throw transient;
			},
			initializeCrons: async () => {},
			deviceMeta,
		});

		expect(logger.error).toHaveBeenCalledOnce();
		const [errArg, msgArg, ctxArg] = vi.mocked(logger.error).mock.calls[0];
		expect(errArg).toBe(transient);
		expect(msgArg).toContain("max attempts reached");
		expect(ctxArg).toMatchObject({
			droppedCount: 1,
			kinds: ["connect"],
			userId: "u-1",
			projectId: "p-1",
			deviceId: "d-1",
			versionId: "v-1",
		});
	});

	it("reports dropped events AND re-queues survivors on a mixed-attempt batch", async () => {
		// One event has exhausted its retries (bumps to the cap and is dropped);
		// a fresher event in the same batch stays under the cap and is re-queued.
		// Both the Sentry drop signal and the backoff re-queue must fire.
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [
				{ kind: "connect", attempts: MAX_USER_EVENT_ATTEMPTS - 1 },
				{
					kind: "message",
					message: { id: "m", type: "ping", payload: {} },
					attempts: 0,
				},
			],
		});

		await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => {
				throw new Error("Too many concurrent dynamic workers");
			},
			initializeCrons: async () => {},
			deviceMeta,
		});

		// The maxed-out event is reported as dropped...
		expect(logger.error).toHaveBeenCalledOnce();
		const [, msgArg, ctxArg] = vi.mocked(logger.error).mock.calls[0];
		expect(msgArg).toContain("max attempts reached");
		expect(ctxArg).toMatchObject({ droppedCount: 1, kinds: ["connect"] });

		// ...while the fresher event is re-queued with its attempt count bumped.
		expect(logger.warn).toHaveBeenCalledOnce();
		const remaining = storage.data.get(PENDING_USER_EVENTS_KEY) as Array<{
			kind: string;
			attempts: number;
		}>;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].kind).toBe("message");
		expect(remaining[0].attempts).toBe(1);
	});

	it("does NOT call logger.error on transient failures below the attempt cap (re-queues instead)", async () => {
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [{ kind: "connect" }],
		});

		await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => {
				throw new Error("Too many concurrent dynamic workers");
			},
			initializeCrons: async () => {},
			deviceMeta,
		});

		// Re-queue path uses logger.warn, not logger.error
		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledOnce();
		// And events are re-queued with attempts bumped
		const remaining = storage.data.get(PENDING_USER_EVENTS_KEY) as Array<{
			attempts: number;
		}>;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].attempts).toBe(1);
	});
});

// Regression: a huge backlog (built up while the alarm was paused) must not be
// flushed in one alarm invocation — doing so blows the per-invocation subrequest
// cap, aborts the invocation before the queue is trimmed, and wedges the device
// forever (observed in prod: per-minute alarm stuck at "Too many subrequests").
describe("drainPendingUserWorkerEvents — bounded batch", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function countingWorker() {
		const calls = { connect: 0, message: 0 };
		const worker = {
			onDeviceConnect: async () => {
				calls.connect++;
			},
			onMessage: async () => {
				calls.message++;
			},
		} as unknown as Awaited<ReturnType<() => Promise<unknown>>>;
		return { worker, calls };
	}

	it("dispatches at most MAX_DRAIN_BATCH events and re-queues the remainder in FIFO order", async () => {
		const total = MAX_DRAIN_BATCH + 70;
		const events = Array.from({ length: total }, (_, i) => ({
			kind: "message" as const,
			message: { id: `m-${i}`, type: "ping", payload: {} },
		}));
		const storage = makeStorage({ [PENDING_USER_EVENTS_KEY]: events });
		const { worker, calls } = countingWorker();

		const returned = await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => worker as never,
			initializeCrons: async () => {},
			deviceMeta,
		});

		// Exactly one batch dispatched, no more.
		expect(calls.message).toBe(MAX_DRAIN_BATCH);
		expect(calls.connect).toBe(0);
		// Worker is returned so the alarm can reuse it for cron dispatch.
		expect(returned).toBe(worker);

		// The untouched tail stays queued, oldest-first, ready for next drain.
		const remaining = storage.data.get(PENDING_USER_EVENTS_KEY) as Array<{
			message: { id: string };
		}>;
		expect(remaining).toHaveLength(70);
		expect(remaining[0].message.id).toBe(`m-${MAX_DRAIN_BATCH}`);
		expect(remaining.at(-1)?.message.id).toBe(`m-${total - 1}`);

		// A follow-up alarm is armed to continue draining.
		expect(storage.alarm).not.toBeNull();
	});

	it("drains the whole backlog across repeated calls and clears the key when done", async () => {
		const total = MAX_DRAIN_BATCH * 2 + 5; // 3 drains: 50, 50, 5
		const events = Array.from({ length: total }, (_, i) => ({
			kind: "message" as const,
			message: { id: `m-${i}`, type: "ping", payload: {} },
		}));
		const storage = makeStorage({ [PENDING_USER_EVENTS_KEY]: events });
		const { worker, calls } = countingWorker();
		const deps = {
			storage,
			getOrCreateUserWorker: async () => worker as never,
			initializeCrons: async () => {},
			deviceMeta,
		};

		await drainPendingUserWorkerEvents(deps);
		await drainPendingUserWorkerEvents(deps);
		await drainPendingUserWorkerEvents(deps);

		expect(calls.message).toBe(total);
		// Queue fully drained → key removed, and a final empty drain is a no-op.
		expect(storage.data.has(PENDING_USER_EVENTS_KEY)).toBe(false);
		expect(await drainPendingUserWorkerEvents(deps)).toBeNull();
	});

	it("runs initializeCrons when a connect is inside the bounded batch", async () => {
		const events = [
			{ kind: "connect" as const },
			...Array.from({ length: 10 }, (_, i) => ({
				kind: "message" as const,
				message: { id: `m-${i}`, type: "ping", payload: {} },
			})),
		];
		const storage = makeStorage({ [PENDING_USER_EVENTS_KEY]: events });
		const { worker } = countingWorker();
		const initializeCrons = vi.fn(async () => {});

		await drainPendingUserWorkerEvents({
			storage,
			getOrCreateUserWorker: async () => worker as never,
			initializeCrons,
			deviceMeta,
		});

		expect(initializeCrons).toHaveBeenCalledOnce();
	});
});

describe("enqueueUserWorkerEvent — queue bounding", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("coalesces redundant connect events (onDeviceConnect is idempotent)", async () => {
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [{ kind: "connect" }],
		});

		await enqueueUserWorkerEvent(storage, { kind: "connect" });

		const queue = storage.data.get(PENDING_USER_EVENTS_KEY) as unknown[];
		expect(queue).toHaveLength(1);
		// But the alarm is still bumped so the pending connect drains promptly.
		expect(storage.alarm).not.toBeNull();
	});

	it("still queues a message even when a connect is pending", async () => {
		const storage = makeStorage({
			[PENDING_USER_EVENTS_KEY]: [{ kind: "connect" }],
		});

		await enqueueUserWorkerEvent(storage, {
			kind: "message",
			message: { id: "m", type: "ping", payload: {} },
		});

		const queue = storage.data.get(PENDING_USER_EVENTS_KEY) as unknown[];
		expect(queue).toHaveLength(2);
	});

	it("caps the queue at MAX_PENDING_EVENTS, dropping the oldest", async () => {
		const full = Array.from({ length: MAX_PENDING_EVENTS }, (_, i) => ({
			kind: "message" as const,
			message: { id: `m-${i}`, type: "ping", payload: {} },
		}));
		const storage = makeStorage({ [PENDING_USER_EVENTS_KEY]: full });

		await enqueueUserWorkerEvent(storage, {
			kind: "message",
			message: { id: "newest", type: "ping", payload: {} },
		});

		const queue = storage.data.get(PENDING_USER_EVENTS_KEY) as Array<{
			message: { id: string };
		}>;
		expect(queue).toHaveLength(MAX_PENDING_EVENTS);
		// Oldest dropped, newest retained.
		expect(queue[0].message.id).toBe("m-1");
		expect(queue.at(-1)?.message.id).toBe("newest");
		expect(logger.warn).toHaveBeenCalledOnce();
	});
});

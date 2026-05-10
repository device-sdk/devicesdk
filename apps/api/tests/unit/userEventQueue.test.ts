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
const { drainPendingUserWorkerEvents, PENDING_USER_EVENTS_KEY } = await import(
	"../../src/durableObjects/lib/userEventQueue"
);
const { MAX_USER_EVENT_ATTEMPTS } = await import(
	"../../src/durableObjects/lib/userEventQueue"
);

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

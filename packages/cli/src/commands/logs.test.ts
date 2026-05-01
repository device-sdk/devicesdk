import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWatchUrl } from "../api.js";
import logs, { formatLogLine } from "./logs.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

// Capture every WebSocket the command opens so tests can drive frames
// through them. Each test resets the array via `beforeEach`.
class FakeWebSocket extends EventEmitter {
	url: string;
	options: unknown;
	closed = false;
	constructor(url: string, options?: unknown) {
		super();
		this.url = url;
		this.options = options;
	}
	close(): void {
		if (this.closed) return;
		this.closed = true;
		// Surface to the command on next tick so listeners are attached.
		setTimeout(() => this.emit("close"), 0);
	}
}

const wsInstances: FakeWebSocket[] = [];

vi.mock("ws", () => ({
	default: vi.fn().mockImplementation((url: string, options?: unknown) => {
		const ws = new FakeWebSocket(url, options);
		wsInstances.push(ws);
		return ws;
	}),
}));

function makeEntry(
	overrides: Partial<{
		id: string;
		level: string;
		message: string;
		created_at: number;
	}> = {},
) {
	return {
		id: "abc123",
		level: "log",
		message: "hello",
		created_at: new Date("2024-01-01T12:00:00.123Z").getTime(),
		...overrides,
	};
}

describe("formatLogLine", () => {
	beforeEach(() => {
		Object.defineProperty(process.stdout, "isTTY", {
			value: true,
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(process.stdout, "isTTY", {
			value: undefined,
			configurable: true,
		});
	});

	it("formats a log entry with timestamp, level, and message", () => {
		const entry = makeEntry({ level: "info", message: "test message" });
		const line = formatLogLine(entry);
		expect(line).toContain("INFO ");
		expect(line).toContain("test message");
	});

	it("pads level to 5 characters", () => {
		expect(formatLogLine(makeEntry({ level: "log" }))).toContain("[LOG  ]");
		expect(formatLogLine(makeEntry({ level: "warn" }))).toContain("[WARN ]");
	});

	it("applies cyan color for log level", () => {
		expect(formatLogLine(makeEntry({ level: "log" }))).toContain("\x1b[36m");
	});

	it("applies cyan color for info level", () => {
		expect(formatLogLine(makeEntry({ level: "info" }))).toContain("\x1b[36m");
	});

	it("applies yellow color for warn level", () => {
		expect(formatLogLine(makeEntry({ level: "warn" }))).toContain("\x1b[33m");
	});

	it("applies red color for error level", () => {
		expect(formatLogLine(makeEntry({ level: "error" }))).toContain("\x1b[31m");
	});

	it("applies gray color for debug level", () => {
		expect(formatLogLine(makeEntry({ level: "debug" }))).toContain("\x1b[90m");
	});

	it("applies no color for unknown level", () => {
		expect(formatLogLine(makeEntry({ level: "unknown" }))).not.toContain(
			"\x1b[",
		);
	});

	it("suppresses color codes when stdout is not a TTY", () => {
		Object.defineProperty(process.stdout, "isTTY", {
			value: undefined,
			configurable: true,
		});
		const line = formatLogLine(makeEntry({ level: "error" }));
		expect(line).not.toContain("\x1b[");
		expect(line).toContain("ERROR");
	});
});

describe("getWatchUrl", () => {
	const originalApiUrl = process.env.DEVICESDK_API_URL;

	afterEach(() => {
		if (originalApiUrl === undefined) {
			delete process.env.DEVICESDK_API_URL;
		} else {
			process.env.DEVICESDK_API_URL = originalApiUrl;
		}
	});

	it("derives wss:// from https:// API host (production default)", () => {
		delete process.env.DEVICESDK_API_URL;
		const url = getWatchUrl("proj", "dev");
		expect(url).toMatch(/^wss:\/\/api\.devicesdk\.com\//);
		expect(url).toContain("/v1/projects/proj/devices/dev/watch");
	});

	it("derives ws:// from http:// API host (local dev)", () => {
		process.env.DEVICESDK_API_URL = "http://localhost:8787";
		const url = getWatchUrl("proj", "dev");
		expect(url).toMatch(/^ws:\/\/localhost:8787\//);
	});

	it("appends backfillLimit and backfillLevel as query params", () => {
		delete process.env.DEVICESDK_API_URL;
		const url = getWatchUrl("proj", "dev", {
			backfillLimit: 25,
			backfillLevel: "warn",
		});
		expect(url).toContain("backfillLimit=25");
		expect(url).toContain("backfillLevel=warn");
	});
});

describe("logs command (WS)", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as unknown as typeof process.exit);

	const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const consoleErrorSpy = vi
		.spyOn(console, "error")
		.mockImplementation(() => {});

	beforeEach(() => {
		vi.clearAllMocks();
		wsInstances.length = 0;
	});

	afterEach(() => {
		process.removeAllListeners("SIGINT");
	});

	it("non-tail: opens a single watcher WS, prints backfill on history_complete, exits 0", async () => {
		const captured = logs("proj", "dev", { tail: false, lines: 50 }).catch(
			(e: Error) => e,
		);
		// Let the command kick off and the FakeWebSocket be created.
		await new Promise((r) => setTimeout(r, 0));
		expect(wsInstances).toHaveLength(1);
		const ws = wsInstances[0];

		expect(ws.url).toContain("/v1/projects/proj/devices/dev/watch");
		expect(ws.url).toContain("backfillLimit=50");
		// Authorization header is attached via the `ws` library options.
		const opts = ws.options as { headers?: { Authorization?: string } };
		expect(opts?.headers?.Authorization).toBe("Bearer test-token");

		ws.emit("open");
		ws.emit(
			"message",
			Buffer.from(
				JSON.stringify({
					event: "log",
					data: makeEntry({ id: "1", message: "first" }),
					replay: true,
				}),
			),
		);
		ws.emit(
			"message",
			Buffer.from(
				JSON.stringify({
					event: "log",
					data: makeEntry({ id: "2", message: "second" }),
					replay: true,
				}),
			),
		);
		ws.emit("message", Buffer.from(JSON.stringify({ event: "history_complete" })));

		const err = (await captured) as Error;
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toMatch(/exit:0/);
		expect(exitSpy).toHaveBeenCalledWith(0);
		expect(consoleSpy.mock.calls.flat().join("\n")).toContain("first");
		expect(consoleSpy.mock.calls.flat().join("\n")).toContain("second");
	});

	it("non-tail: prints 'No logs found.' when backfill is empty", async () => {
		const captured = logs("proj", "dev", { tail: false, lines: 50 }).catch(
			(e: Error) => e,
		);
		await new Promise((r) => setTimeout(r, 0));
		const ws = wsInstances[0];
		ws.emit("open");
		ws.emit("message", Buffer.from(JSON.stringify({ event: "history_complete" })));

		const err = (await captured) as Error;
		expect(err.message).toMatch(/exit:0/);
		expect(consoleSpy).toHaveBeenCalledWith("No logs found.");
	});

	it("non-tail: bails non-zero if the connection closes before history_complete", async () => {
		const captured = logs("proj", "dev", { tail: false, lines: 50 }).catch(
			(e: Error) => e,
		);
		await new Promise((r) => setTimeout(r, 0));
		const ws = wsInstances[0];
		ws.emit("open");
		ws.emit("close");

		const err = (await captured) as Error;
		expect(err.message).toMatch(/exit:1/);
		expect(consoleErrorSpy.mock.calls.flat().join("\n")).toContain(
			"Connection closed",
		);
	});

	it("tail: bails non-zero after MAX_RECONNECT_ATTEMPTS consecutive closes", async () => {
		vi.useFakeTimers();
		// Capture the eventual rejection synchronously so it's never unhandled.
		const captured = logs("proj", "dev", { tail: true, lines: 10 }).catch(
			(e: Error) => e,
		);

		// Drive the close→reconnect loop. Each close schedules a setTimeout for
		// the next openSession; we advance past it and emit close again.
		for (let i = 0; i < 6; i++) {
			await vi.advanceTimersByTimeAsync(0);
			const ws = wsInstances[wsInstances.length - 1];
			expect(ws).toBeDefined();
			ws.emit("close");
			// 1s, 2s, 4s, 8s, 16s — cumulative; advance generously.
			await vi.advanceTimersByTimeAsync(35_000);
		}

		const err = await captured;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/exit:1/);
		expect(consoleErrorSpy.mock.calls.flat().join("\n")).toContain(
			"Failed to reconnect",
		);
		vi.useRealTimers();
	});

	it("tail: SIGINT exits cleanly with code 0", async () => {
		const captured = logs("proj", "dev", { tail: true, lines: 10 }).catch(
			(e: Error) => e,
		);
		await new Promise((r) => setTimeout(r, 0));

		try {
			process.emit("SIGINT");
		} catch {
			/* exitSpy throws */
		}

		const err = (await captured) as Error;
		expect(err.message).toMatch(/exit:0/);
	});
});

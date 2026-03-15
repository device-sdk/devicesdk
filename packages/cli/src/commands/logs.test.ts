import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import logs, { formatLogLine } from "./logs.js";

const POLL_INTERVAL_MS = 2000;

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const apiMocks = {
	getLogs: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		getLogs: (...args: any[]) => apiMocks.getLogs(...args),
	};
});

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
		const logEntry = formatLogLine(makeEntry({ level: "log" }));
		const warnEntry = formatLogLine(makeEntry({ level: "warn" }));
		expect(logEntry).toContain("[LOG  ]");
		expect(warnEntry).toContain("[WARN ]");
	});

	it("applies cyan color for log level", () => {
		const line = formatLogLine(makeEntry({ level: "log" }));
		expect(line).toContain("\x1b[36m");
	});

	it("applies cyan color for info level", () => {
		const line = formatLogLine(makeEntry({ level: "info" }));
		expect(line).toContain("\x1b[36m");
	});

	it("applies yellow color for warn level", () => {
		const line = formatLogLine(makeEntry({ level: "warn" }));
		expect(line).toContain("\x1b[33m");
	});

	it("applies red color for error level", () => {
		const line = formatLogLine(makeEntry({ level: "error" }));
		expect(line).toContain("\x1b[31m");
	});

	it("applies gray color for debug level", () => {
		const line = formatLogLine(makeEntry({ level: "debug" }));
		expect(line).toContain("\x1b[90m");
	});

	it("applies no color for unknown level", () => {
		const line = formatLogLine(makeEntry({ level: "unknown" }));
		expect(line).not.toContain("\x1b[");
	});

	it("suppresses color codes when stdout is not a TTY", () => {
		Object.defineProperty(process.stdout, "isTTY", {
			value: undefined,
			configurable: true,
		});
		const line = formatLogLine(makeEntry({ level: "error" }));
		expect(line).not.toContain("\x1b[");
		expect(line).toContain("ERROR");
		expect(line).toContain("hello");
	});
});

describe("logs command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	const consoleErrorSpy = vi
		.spyOn(console, "error")
		.mockImplementation(() => {});
	const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		// Remove any SIGINT listeners registered during tests
		process.removeAllListeners("SIGINT");
	});

	describe("default (non-tail) mode", () => {
		it("calls getLogs with the right limit and level, prints each line", async () => {
			apiMocks.getLogs.mockResolvedValue({
				logs: [makeEntry({ message: "msg1" }), makeEntry({ message: "msg2" })],
				next_cursor: null,
			});

			await logs("my-project", "my-device", {
				tail: false,
				lines: 50,
			});

			expect(apiMocks.getLogs).toHaveBeenCalledWith(
				"test-token",
				"my-project",
				"my-device",
				{ limit: 50, level: undefined },
			);
			expect(consoleSpy).toHaveBeenCalledTimes(2);
		});

		it("passes --lines option as limit", async () => {
			apiMocks.getLogs.mockResolvedValue({ logs: [], next_cursor: null });

			await logs("proj", "dev", { tail: false, lines: 10 });

			expect(apiMocks.getLogs).toHaveBeenCalledWith(
				"test-token",
				"proj",
				"dev",
				{ limit: 10, level: undefined },
			);
		});

		it("passes --level option", async () => {
			apiMocks.getLogs.mockResolvedValue({ logs: [], next_cursor: null });

			await logs("proj", "dev", { tail: false, lines: 50, level: "warn" });

			expect(apiMocks.getLogs).toHaveBeenCalledWith(
				"test-token",
				"proj",
				"dev",
				{ limit: 50, level: "warn" },
			);
		});

		it("prints 'No logs found.' when empty", async () => {
			apiMocks.getLogs.mockResolvedValue({ logs: [], next_cursor: null });

			await logs("proj", "dev", { tail: false, lines: 50 });

			expect(consoleSpy).toHaveBeenCalledWith("No logs found.");
		});

		it("prints error and exits with code 1 on 404", async () => {
			apiMocks.getLogs.mockRejectedValue(
				new DeviceSDKApiError("Not found", 404),
			);

			await expect(
				logs("proj", "dev", { tail: false, lines: 50 }),
			).rejects.toThrowError(/exit:1/);
			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("not found"),
			);
		});
	});

	describe("tail mode", () => {
		it("fetches initial batch with limit and level, then polls with cursor", async () => {
			apiMocks.getLogs
				.mockResolvedValueOnce({
					logs: [makeEntry({ message: "initial" })],
					next_cursor: "cursor-1",
				})
				.mockResolvedValueOnce({
					logs: [makeEntry({ id: "xyz", message: "new entry" })],
					next_cursor: "cursor-2",
				});

			const promise = logs("proj", "dev", { tail: true, lines: 50 });

			// Let the initial fetch resolve
			await vi.advanceTimersByTimeAsync(0);

			// Advance timers to trigger first poll
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

			// Emit SIGINT to stop the loop — handler throws via exitSpy mock
			try {
				process.emit("SIGINT");
			} catch {
				// expected: exitSpy throws Error("exit:0")
			}

			// Drain any remaining microtasks
			await vi.advanceTimersByTimeAsync(0);

			expect(exitSpy).toHaveBeenCalledWith(0);
			expect(apiMocks.getLogs).toHaveBeenNthCalledWith(
				1,
				"test-token",
				"proj",
				"dev",
				{ limit: 50, level: undefined },
			);
			expect(apiMocks.getLogs).toHaveBeenNthCalledWith(
				2,
				"test-token",
				"proj",
				"dev",
				{ cursor: "cursor-1" },
			);
		});

		it("shows 'Waiting for logs...' when initial batch is empty", async () => {
			apiMocks.getLogs.mockResolvedValue({
				logs: [],
				next_cursor: null,
			});

			logs("proj", "dev", { tail: true, lines: 50 });

			await vi.advanceTimersByTimeAsync(0);

			try {
				process.emit("SIGINT");
			} catch {
				// expected: exitSpy throws Error("exit:0")
			}

			expect(exitSpy).toHaveBeenCalledWith(0);
			expect(consoleSpy).toHaveBeenCalledWith("Waiting for logs...");
		});

		it("exits with code 1 on 404 in initial fetch", async () => {
			apiMocks.getLogs.mockRejectedValue(
				new DeviceSDKApiError("Not found", 404),
			);

			await expect(
				logs("proj", "dev", { tail: true, lines: 50 }),
			).rejects.toThrowError(/exit:1/);
			expect(exitSpy).toHaveBeenCalledWith(1);
		});

		it("prints warning and continues on network error in poll cycle", async () => {
			apiMocks.getLogs
				.mockResolvedValueOnce({
					logs: [],
					next_cursor: null,
				})
				.mockRejectedValueOnce(new Error("network error"))
				.mockResolvedValue({ logs: [], next_cursor: null });

			logs("proj", "dev", { tail: true, lines: 50 });

			await vi.advanceTimersByTimeAsync(0);

			// First poll — network error
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to fetch logs"),
			);

			// Second poll — succeeds
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

			try {
				process.emit("SIGINT");
			} catch {
				// expected: exitSpy throws Error("exit:0")
			}

			expect(exitSpy).toHaveBeenCalledWith(0);
			// Should have made 3 calls total: initial + 2 polls
			expect(apiMocks.getLogs).toHaveBeenCalledTimes(3);
		});

		it("does not print duplicate entries when next_cursor is null after initial fetch", async () => {
			const entry = makeEntry({ id: "entry-1", message: "initial log" });
			apiMocks.getLogs
				.mockResolvedValueOnce({
					logs: [entry],
					next_cursor: null,
				})
				.mockResolvedValue({
					logs: [entry],
					next_cursor: null,
				});

			logs("proj", "dev", { tail: true, lines: 50 });

			// Initial fetch
			await vi.advanceTimersByTimeAsync(0);

			// First poll — returns same entry
			await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

			try {
				process.emit("SIGINT");
			} catch {
				// expected
			}

			// Entry should only be printed once despite being returned twice
			const logCalls = consoleSpy.mock.calls.filter((call) =>
				String(call[0]).includes("initial log"),
			);
			expect(logCalls).toHaveLength(1);
		});
	});
});

import { AsyncLocalStorage } from "node:async_hooks";

export interface LogSink {
	persistLog(level: string, message: string): void;
}

const logSinkStorage = new AsyncLocalStorage<LogSink>();

let installed = false;

function serialize(args: unknown[]): string {
	try {
		return JSON.stringify(args);
	} catch {
		return JSON.stringify(args.map(String));
	}
}

/**
 * Patches global console once so user-script console.* calls are persisted as
 * device logs (and streamed to watchers), exactly like the sandboxed-worker
 * console override did. User scripts share the server process, so the only
 * per-device routing signal is the async context: dispatchers wrap every user
 * handler call in runWithLogCapture(), and the patched console looks up the
 * active sink. Server-side logging (logger.ts) writes through the saved
 * originals, so it is never captured.
 */
export function installConsoleCapture(): void {
	if (installed) return;
	installed = true;

	const levels = ["log", "info", "warn", "error", "debug"] as const;
	for (const level of levels) {
		const original = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			original(...args);
			const sink = logSinkStorage.getStore();
			if (sink) {
				try {
					sink.persistLog(level, serialize(args));
				} catch {
					// Log capture must never break user code.
				}
			}
		};
	}
}

/** Runs fn with console.* output routed to the given device log sink. */
export function runWithLogCapture<T>(sink: LogSink, fn: () => T): T {
	return logSinkStorage.run(sink, fn);
}

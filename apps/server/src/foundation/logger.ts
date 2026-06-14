import { mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ServerConfig } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

type FileSink = ReturnType<ReturnType<typeof Bun.file>["writer"]>;

interface LoggerOptions {
	logFile: string;
	/** When true, also emit logs to stdout/stderr for local visibility. */
	mirrorToConsole?: boolean;
	/** Maximum log file size in bytes before rotation. Default 10 MiB. */
	maxFileSize?: number;
	/** Number of rotated backups to retain. Default 5. */
	maxFiles?: number;
}

// Bind the real console functions at module load — before consoleCapture
// patches them — so server-side logs are never captured into device logs
// (and a failure inside the log-capture path can't recurse).
const raw = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	debug: console.debug.bind(console),
	error: console.error.bind(console),
};

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

/**
 * Server file logger backed by Bun's FileSink.
 *
 * Implemented as a global singleton so endpoints and standalone helpers can
 * import and use it directly. Classes that are constructed at boot receive the
 * logger through constructor injection (DeviceHub, DeviceSession, etc.) so they
 * remain testable without touching global state.
 */
export class ServerLogger {
	private logFile: string;
	private mirrorToConsole: boolean;
	private maxFileSize: number;
	private maxFiles: number;
	private sink: FileSink | undefined;
	private currentSize = 0;
	private initialized = false;

	constructor(opts: LoggerOptions) {
		this.logFile = opts.logFile;
		this.mirrorToConsole = opts.mirrorToConsole ?? true;
		this.maxFileSize = opts.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
		this.maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
		this.open();
	}

	/** Open the underlying file sink. Called automatically by createLogger. */
	open(): void {
		if (this.initialized) return;
		mkdirSync(dirname(this.logFile), { recursive: true });
		this.sink = Bun.file(this.logFile).writer();
		this.currentSize = this.getFileSize();
		this.initialized = true;
	}

	private getFileSize(): number {
		try {
			return Bun.file(this.logFile).size;
		} catch {
			return 0;
		}
	}

	private async rotateIfNeeded(line: string): Promise<void> {
		if (!this.sink) return;
		const lineBytes = Buffer.byteLength(line, "utf8");
		if (this.currentSize + lineBytes <= this.maxFileSize) return;

		// Close current sink and rotate files on disk synchronously.
		try {
			await this.sink.end();
		} catch {
			// Best-effort close before rotating.
		}
		for (let i = this.maxFiles - 1; i >= 1; i--) {
			const src = `${this.logFile}.${i}`;
			const dst = `${this.logFile}.${i + 1}`;
			try {
				renameSync(src, dst);
			} catch {
				// If the source doesn't exist, continue rotating.
			}
		}
		try {
			renameSync(this.logFile, `${this.logFile}.1`);
		} catch {
			// Ignore rotation failures; opening a new sink below recovers.
		}

		this.sink = Bun.file(this.logFile).writer();
		this.currentSize = 0;
	}

	private async emit(
		level: LogLevel,
		message: string,
		context?: LogContext,
	): Promise<void> {
		const line = JSON.stringify({
			level,
			message,
			time: new Date().toISOString(),
			...context,
		});

		if (this.initialized && this.sink) {
			const formatted = `${line}\n`;
			await this.rotateIfNeeded(formatted);
			const written = await this.sink.write(formatted);
			this.currentSize += written;
			// Best-effort flush; don't await in the logging hot path.
			Promise.resolve(this.sink.flush()).catch(() => {
				// Ignore flush failures to keep request handling safe.
			});
		}

		if (this.mirrorToConsole) {
			const fn = raw[level === "debug" ? "log" : level];
			fn(line);
		}
	}

	async debug(message: string, context?: LogContext): Promise<void> {
		await this.emit("debug", message, context);
	}

	async info(message: string, context?: LogContext): Promise<void> {
		await this.emit("info", message, context);
	}

	async warn(message: string, context?: LogContext): Promise<void> {
		await this.emit("warn", message, context);
	}

	async error(
		error: Error | unknown,
		message: string,
		context?: LogContext,
	): Promise<void> {
		const err = error instanceof Error ? error : new Error(String(error));
		await this.emit("error", message, {
			...context,
			errorMessage: err.message,
			stack: err.stack,
		});
	}

	/** Flush any buffered log data to disk. */
	async flush(): Promise<void> {
		await this.sink?.flush();
	}

	/** Close the underlying file sink. */
	async close(): Promise<void> {
		await this.sink?.end();
		this.initialized = false;
	}
}

let singleton: ServerLogger | null = null;

function defaultLogFile(): string {
	return join(process.cwd(), "data", "server.log");
}

/**
 * Create and open the global logger from server config. Must be called once
 * before the server starts handling traffic; subsequent calls return the
 * existing instance.
 */
export function createLogger(config: ServerConfig): ServerLogger {
	if (!singleton) {
		singleton = new ServerLogger({
			logFile: config.logFile,
			mirrorToConsole: true,
		});
		singleton.open();
	}
	return singleton;
}

/** Return the global logger, creating a default instance if necessary. */
export function getLogger(): ServerLogger {
	if (!singleton) {
		singleton = new ServerLogger({ logFile: defaultLogFile() });
		singleton.open();
	}
	return singleton;
}

/** Reset the singleton; intended for tests only. */
export function resetLogger(): void {
	singleton = null;
}

/**
 * Global singleton logger instance used by endpoints and standalone helpers.
 * Access is lazy so server.ts can call createLogger(config) before any log
 * lines are emitted.
 */
export const logger = {
	debug(message: string, context?: LogContext) {
		getLogger().debug(message, context);
	},
	info(message: string, context?: LogContext) {
		getLogger().info(message, context);
	},
	warn(message: string, context?: LogContext) {
		getLogger().warn(message, context);
	},
	error(error: Error | unknown, message: string, context?: LogContext) {
		getLogger().error(error, message, context);
	},
};

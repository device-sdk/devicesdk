type LogContext = Record<string, unknown>;

// Bind the real console functions at module load — before consoleCapture
// patches them — so server-side logs are never captured into device logs
// (and a failure inside the log-capture path can't recurse).
const raw = {
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
};

function emit(
	level: "debug" | "info" | "warn" | "error",
	message: string,
	context?: LogContext,
) {
	const line = {
		level,
		message,
		time: new Date().toISOString(),
		...context,
	};
	// One JSON object per line — easy to grep and to ship to any collector.
	raw[level === "debug" ? "log" : level](JSON.stringify(line));
}

export const logger = {
	debug(message: string, context?: LogContext) {
		emit("debug", message, context);
	},
	info(message: string, context?: LogContext) {
		emit("info", message, context);
	},
	warn(message: string, context?: LogContext) {
		emit("warn", message, context);
	},
	error(error: Error | unknown, message: string, context?: LogContext) {
		const err = error instanceof Error ? error : new Error(String(error));
		emit("error", message, {
			...context,
			errorMessage: err.message,
			stack: err.stack,
		});
	},
};

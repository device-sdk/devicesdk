type LogContext = Record<string, unknown>;

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
	console[level === "debug" ? "log" : level](JSON.stringify(line));
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

import {
	DeviceSDKApiError,
	getLogs,
	type LogEntry,
	type LogsResponse,
} from "../api.js";
import { requireAuth } from "../credentials.js";

export const POLL_INTERVAL_MS = 2000;

interface LogsOptions {
	tail: boolean;
	lines: number;
	level?: string;
}

const LEVEL_COLORS: Record<string, string> = {
	log: "\x1b[36m",
	info: "\x1b[36m",
	warn: "\x1b[33m",
	error: "\x1b[31m",
	debug: "\x1b[90m",
};
const RESET = "\x1b[0m";

export function formatLogLine(entry: LogEntry): string {
	const ts = new Date(entry.created_at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
	});
	const useColor = process.stdout.isTTY === true;
	const color = useColor ? (LEVEL_COLORS[entry.level] ?? "") : "";
	const reset = useColor && color ? RESET : "";
	const level = entry.level.toUpperCase().padEnd(5);
	return `${ts}  ${color}[${level}]${reset}  ${entry.message}`;
}

export default async function logs(
	projectId: string,
	deviceId: string,
	options: LogsOptions,
): Promise<void> {
	const token = await requireAuth();

	if (options.tail) {
		// Fetch initial batch to anchor the cursor
		let cursor: string | null = null;
		// seenIds deduplicates entries when next_cursor is null; capped at 10 000 to avoid unbounded growth
		const MAX_SEEN = 10_000;
		const seenIds = new Set<string>();

		// Register SIGINT handler before any async work so Ctrl-C is always caught
		const sigintHandler = () => {
			console.log("\nStopped tailing.");
			process.exit(0);
		};
		process.once("SIGINT", sigintHandler);

		try {
			const initial = await getLogs(token, projectId, deviceId, {
				limit: options.lines,
				level: options.level,
			});

			if (initial.logs.length === 0) {
				console.log("Waiting for logs...");
			} else {
				for (const entry of initial.logs) {
					seenIds.add(entry.id);
					console.log(formatLogLine(entry));
				}
			}

			cursor = initial.next_cursor;
		} catch (err) {
			process.removeListener("SIGINT", sigintHandler);
			if (err instanceof DeviceSDKApiError && err.statusCode === 404) {
				console.error(`✗ Error: Project or device not found.`);
				process.exit(1);
			}
			throw err;
		}

		// Polling loop
		while (true) {
			await new Promise<void>((resolve) =>
				setTimeout(resolve, POLL_INTERVAL_MS),
			);

			try {
				const pollOptions: { cursor?: string; level?: string } = {};
				if (cursor !== null) {
					pollOptions.cursor = cursor;
				}
				if (options.level) {
					pollOptions.level = options.level;
				}

				const result = await getLogs(token, projectId, deviceId, pollOptions);

				for (const entry of result.logs) {
					if (!seenIds.has(entry.id)) {
						seenIds.add(entry.id);
						console.log(formatLogLine(entry));
					}
				}
				// Prevent unbounded growth: re-seed with only the current batch so
				// the next poll won't reprint already-displayed entries after the clear.
				if (seenIds.size >= MAX_SEEN) {
					seenIds.clear();
					for (const entry of result.logs) {
						seenIds.add(entry.id);
					}
				}
				// Always advance cursor to avoid re-fetching the same page
				cursor = result.next_cursor;
			} catch (err) {
				if (err instanceof DeviceSDKApiError && err.statusCode === 404) {
					console.error(`✗ Error: Project or device not found.`);
					process.exit(1);
				}
				// Network error — warn and retry
				console.warn(`Warning: Failed to fetch logs, retrying...`);
			}
		}
	} else {
		// Default (non-tail) mode
		let result: LogsResponse;
		try {
			result = await getLogs(token, projectId, deviceId, {
				limit: options.lines,
				level: options.level,
			});
		} catch (err) {
			if (err instanceof DeviceSDKApiError && err.statusCode === 404) {
				console.error(`✗ Error: Project or device not found.`);
				process.exit(1);
			}
			throw err;
		}

		if (result.logs.length === 0) {
			console.log("No logs found.");
			return;
		}

		for (const entry of result.logs) {
			console.log(formatLogLine(entry));
		}
	}
}

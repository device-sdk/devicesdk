import { DeviceSDKApiError, getLogs, type LogEntry } from "../api.js";
import { requireAuth } from "../credentials.js";

const POLL_INTERVAL_MS = 2000;

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
		// @ts-expect-error fractionalSecondDigits is valid but not in older TS lib types
		fractionalSecondDigits: 3,
	});
	const useColor = process.stdout.isTTY !== false;
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
		let initialized = false;

		try {
			const initial = await getLogs(token, projectId, deviceId, {
				limit: options.lines,
				level: options.level,
			});

			if (initial.logs.length === 0) {
				console.log("Waiting for logs...");
			} else {
				for (const entry of initial.logs) {
					console.log(formatLogLine(entry));
				}
			}

			cursor = initial.next_cursor;
			initialized = true;
		} catch (err) {
			if (err instanceof DeviceSDKApiError && err.statusCode === 404) {
				console.error(`✗ Error: Project or device not found.`);
				process.exit(1);
			}
			throw err;
		}

		process.on("SIGINT", () => {
			console.log("\nStopped tailing.");
			process.exit(0);
		});

		// Polling loop
		while (true) {
			await new Promise<void>((resolve) =>
				setTimeout(resolve, POLL_INTERVAL_MS),
			);

			try {
				const pollOptions: { cursor?: string; level?: string } = {};
				if (initialized && cursor !== null) {
					pollOptions.cursor = cursor;
				}
				if (options.level) {
					pollOptions.level = options.level;
				}

				const result = await getLogs(token, projectId, deviceId, pollOptions);

				if (result.logs.length > 0) {
					for (const entry of result.logs) {
						console.log(formatLogLine(entry));
					}
					cursor = result.next_cursor;
				}
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
		let result: Awaited<ReturnType<typeof getLogs>>;
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

import WebSocket from "ws";
import { getWatchUrl, type LogEntry } from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import {
	emitJsonError,
	emitJsonSuccess,
	emitNdjson,
	isJsonMode,
} from "../output.js";
import { loadConfig } from "../utils.js";

interface LogsOptions {
	tail: boolean;
	lines: number;
	level?: string;
	config?: string;
	json?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
	log: "\x1b[36m",
	info: "\x1b[36m",
	warn: "\x1b[33m",
	error: "\x1b[31m",
	debug: "\x1b[90m",
};
const RESET = "\x1b[0m";

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;

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

interface WatcherFrame {
	event: string;
	data?: LogEntry | { connected: boolean; connectedSince: number | null };
	replay?: boolean;
}

interface SessionResult {
	exitCode: number;
	reason?: string;
}

interface SessionState {
	tail: boolean;
	level?: string;
	lines: number;
	token: string;
	projectId: string;
	deviceId: string;
	json: boolean;
	seenIds: Set<string>;
	bufferedHistory: LogEntry[];
	historyComplete: boolean;
	reconnectAttempts: number;
	reconnectDelay: number;
	finished: boolean;
	currentSocket?: WebSocket;
	resolve: (result: SessionResult) => void;
}

function isLogEntry(d: unknown): d is LogEntry {
	return (
		d !== null &&
		typeof d === "object" &&
		"id" in d &&
		typeof (d as LogEntry).id === "string" &&
		"level" in d &&
		typeof (d as LogEntry).level === "string" &&
		"message" in d &&
		typeof (d as LogEntry).message === "string" &&
		"created_at" in d &&
		typeof (d as LogEntry).created_at === "number"
	);
}

function finish(state: SessionState, result: SessionResult): void {
	if (state.finished) return;
	state.finished = true;
	if (state.currentSocket) {
		try {
			state.currentSocket.close();
		} catch {
			/* already closing */
		}
	}
	state.resolve(result);
}

/**
 * Open one WebSocket to the watcher endpoint. Replaces the polling-based
 * `--tail` loop that retired in May 2026 — see the comment block on
 * `BaseDevice.getLogs` in apps/api/src/durableObjects/lib/device.ts.
 *
 * Non-tail mode: collect replay frames, print on `history_complete`, finish 0.
 * Tail mode: print replay then keep the socket open; reconnect with
 * exponential backoff (1 s → 30 s) up to MAX_RECONNECT_ATTEMPTS times before
 * finishing non-zero.
 */
function openSession(state: SessionState): void {
	if (state.finished) return;

	const url = getWatchUrl(state.projectId, state.deviceId, {
		backfillLimit: state.lines,
		backfillLevel: state.level,
	});
	const ws = new WebSocket(url, {
		headers: { Authorization: `Bearer ${state.token}` },
	});
	state.currentSocket = ws;

	ws.on("open", () => {
		state.reconnectAttempts = 0;
		state.reconnectDelay = RECONNECT_INITIAL_MS;
		state.bufferedHistory = [];
		state.historyComplete = false;
	});

	ws.on("unexpected-response", (_req, res) => {
		const status = res.statusCode ?? 0;
		const retryAfter = res.headers["retry-after"];
		const headerHint = retryAfter ? ` (Retry-After: ${retryAfter})` : "";
		if (status === 401 || status === 403) {
			finish(state, {
				exitCode: EXIT.GENERIC,
				reason: `Watcher upgrade failed: ${status} ${res.statusMessage ?? ""}${headerHint}\n  Run \`devicesdk login\` to re-authenticate.`,
			});
		} else if (status === 429) {
			// Rate-limited at the edge or by the cross-route block list. Retrying
			// from the same client just deepens the burn that triggered the block
			// in the first place — terminate and let the operator decide when
			// to come back. Honour `Retry-After` in the surfaced message.
			finish(state, {
				exitCode: EXIT.GENERIC,
				reason: `Rate limited: ${status} ${res.statusMessage ?? ""}${headerHint}\n  Wait for the period above to elapse before retrying.`,
			});
		} else if (!state.json) {
			// Non-auth, non-rate-limit failure — let close fire and reconnect path
			// handle it. Suppress stderr in JSON mode so the only output is the
			// final JSON (or NDJSON) document; the close handler will emit a
			// `logs_session_error` record describing the failure.
			console.error(
				`✗ Watcher upgrade failed: ${status} ${res.statusMessage ?? ""}${headerHint}`,
			);
		}
	});

	ws.on("message", (raw) => {
		let frame: WatcherFrame;
		try {
			frame = JSON.parse(raw.toString()) as WatcherFrame;
		} catch {
			return;
		}

		if (frame.event === "log" && isLogEntry(frame.data)) {
			const entry = frame.data;
			if (state.seenIds.has(entry.id)) return;
			state.seenIds.add(entry.id);
			// Bound memory in long-running --tail sessions. Only ids within a
			// reconnect's backfill-replay window can collide, so evicting the
			// oldest beyond a generous cap never produces a duplicate in practice.
			if (state.seenIds.size > 5000) {
				const oldest = state.seenIds.values().next().value;
				if (oldest !== undefined) state.seenIds.delete(oldest);
			}

			if (frame.replay && !state.historyComplete) {
				state.bufferedHistory.push(entry);
			} else if (state.json) {
				// In tail+json mode, stream live entries as NDJSON immediately.
				emitNdjson({ event: "log", entry });
			} else {
				console.log(formatLogLine(entry));
			}
		} else if (frame.event === "history_complete") {
			state.historyComplete = true;
			if (state.json) {
				// Non-tail json: emit a single { success, result: { entries } }
				// Tail json: replay the history as NDJSON, then continue streaming.
				if (state.tail) {
					for (const entry of state.bufferedHistory) {
						emitNdjson({ event: "log", entry, replay: true });
					}
					state.bufferedHistory = [];
				} else {
					emitJsonSuccess({
						projectId: state.projectId,
						deviceId: state.deviceId,
						entries: state.bufferedHistory,
					});
					state.bufferedHistory = [];
					finish(state, { exitCode: EXIT.SUCCESS });
				}
			} else {
				for (const entry of state.bufferedHistory) {
					console.log(formatLogLine(entry));
				}
				state.bufferedHistory = [];
				if (!state.tail) {
					if (state.seenIds.size === 0) {
						console.log("No logs found.");
					}
					finish(state, { exitCode: EXIT.SUCCESS });
				}
			}
		}
		// `event === "status"` and `event === "state"` ignored.
	});

	const handleClose = () => {
		state.currentSocket = undefined;
		if (state.finished) return;
		if (!state.tail) {
			finish(state, {
				exitCode: EXIT.GENERIC,
				reason: "Connection closed before logs were received.",
			});
			return;
		}

		state.reconnectAttempts++;
		if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			finish(state, {
				exitCode: EXIT.GENERIC,
				reason: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts.`,
			});
			return;
		}

		const delay = state.reconnectDelay;
		state.reconnectDelay = Math.min(state.reconnectDelay * 2, RECONNECT_MAX_MS);
		setTimeout(() => openSession(state), delay);
	};

	ws.on("close", handleClose);
	ws.on("error", () => {
		// `error` typically precedes `close`; let close drive reconnect.
	});
}

export default async function logs(
	projectIdArg: string | undefined,
	deviceIdArg: string | undefined,
	options: LogsOptions,
): Promise<void> {
	const json = isJsonMode(options);
	const token = await requireAuth();

	let projectId = projectIdArg;
	let deviceId = deviceIdArg;
	if (!projectId || !deviceId) {
		const config = await loadConfig(options.config);
		if (!projectId) projectId = config.projectId;
		if (!deviceId) {
			const deviceKeys = Object.keys(config.devices);
			if (deviceKeys.length === 1) {
				deviceId = deviceKeys[0];
			} else if (deviceKeys.length === 0) {
				if (json) {
					emitJsonError("No devices declared in devicesdk.ts", {
						code: "no_devices_configured",
						docs: "https://devicesdk.com/docs/cli/logs/",
					});
				} else {
					console.error("✗ Error: No devices declared in devicesdk.ts\n");
				}
				process.exit(EXIT.CONFIG_INVALID);
			} else {
				if (json) {
					emitJsonError(
						"Multiple devices in devicesdk.ts — pass one as positional.",
						{
							code: "device_required",
							docs: "https://devicesdk.com/docs/cli/logs/",
						},
					);
				} else {
					console.error(
						"✗ Error: Multiple devices in devicesdk.ts — pass one as positional.\n",
					);
					console.error(`  Available: ${deviceKeys.join(", ")}`);
				}
				process.exit(EXIT.CONFIG_INVALID);
			}
		}
	}

	const result = await new Promise<SessionResult>((resolve) => {
		const state: SessionState = {
			tail: options.tail,
			level: options.level,
			// Server clamps to 100; mirror that here so users get predictable
			// behaviour without needing a server round-trip.
			lines: Math.min(Math.max(options.lines, 1), 100),
			token,
			projectId,
			deviceId,
			json,
			seenIds: new Set(),
			bufferedHistory: [],
			historyComplete: false,
			reconnectAttempts: 0,
			reconnectDelay: RECONNECT_INITIAL_MS,
			finished: false,
			resolve,
		};

		process.once("SIGINT", () => {
			if (state.tail && !json) {
				console.log("\nStopped tailing.");
			}
			finish(state, { exitCode: EXIT.SUCCESS });
		});

		openSession(state);
	});

	if (result.reason) {
		if (json) {
			emitJsonError(result.reason, {
				code: "logs_session_error",
				docs: "https://devicesdk.com/docs/cli/logs/",
			});
		} else {
			console.error(`✗ ${result.reason}`);
		}
	}
	process.exit(result.exitCode);
}

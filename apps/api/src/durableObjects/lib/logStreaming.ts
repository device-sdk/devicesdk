import type { DeviceResponse } from "@devicesdk/core";
import {
	LOG_CLEANUP_INTERVAL,
	LOG_CLEANUP_MIN_INTERVAL_MS,
	LOG_MAX_STORED,
	LOG_MESSAGE_MAX_LENGTH,
	LOG_RETENTION_MS,
	type LogLevel,
	VALID_LOG_LEVELS,
} from "../../foundation/consts";
import { logger } from "../../foundation/logger";

// Mutable state shared with the calling Durable Object. Lives on the DO so it
// survives across this module's function calls; hibernation discards it.
export interface LogStreamState {
	logsTableReady: boolean;
	logWriteCount: number;
	lastLogCleanupAt: number;
}

export function ensureLogsTable(sql: SqlStorage, state: LogStreamState): void {
	if (state.logsTableReady) return;
	sql.exec(`
		CREATE TABLE IF NOT EXISTS device_logs (
			id TEXT PRIMARY KEY,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
	`);
	sql.exec(
		"CREATE INDEX IF NOT EXISTS idx_logs_created_at ON device_logs(created_at)",
	);
	state.logsTableReady = true;
}

/**
 * Fans an event out to every hibernating "watcher"-tagged WebSocket.
 * Safe to call from inside `webSocketMessage` and similar already-woken
 * handlers — adding watchers costs no extra duration there.
 */
export function broadcastToWatchers(
	ctx: DurableObjectState,
	event: string,
	data: unknown,
): void {
	const sockets = ctx.getWebSockets("watcher");
	if (sockets.length === 0) return;
	const msg = JSON.stringify({ event, data });
	for (const ws of sockets) {
		try {
			ws.send(msg);
		} catch {
			// client gone; hibernation runtime will clean up
		}
	}
}

export function emitStatusEvent(
	ctx: DurableObjectState,
	status: { connected: boolean; connectedSince: number | null },
): void {
	broadcastToWatchers(ctx, "status", status);
}

/**
 * Emits a structured `state` event to watchers for well-known hardware
 * messages. Unknown message types are ignored here and still flow through the
 * normal user worker `onMessage` path.
 */
export function broadcastStateFromMessage(
	ctx: DurableObjectState,
	message: DeviceResponse,
): void {
	try {
		switch (message.type) {
			case "gpio_state_changed": {
				const { pin, state } = message.payload as {
					pin: number;
					state: "high" | "low";
				};
				if (typeof pin !== "number" || pin < 0 || pin > 255) break;
				broadcastToWatchers(ctx, "state", {
					entity_id: `gpio_pin_${pin}`,
					value: state,
					source: "gpio_state_changed",
				});
				break;
			}
			case "pin_state_update": {
				const { pin, value } = message.payload as {
					pin: number;
					value: number | string;
				};
				if (typeof pin !== "number" || pin < 0 || pin > 255) break;
				broadcastToWatchers(ctx, "state", {
					entity_id: `gpio_pin_${pin}_analog`,
					value,
					source: "pin_state_update",
				});
				break;
			}
			case "temperature_result": {
				const { celsius } = message.payload as { celsius: number };
				broadcastToWatchers(ctx, "state", {
					entity_id: "temperature",
					value: celsius,
					source: "temperature_result",
				});
				break;
			}
		}
	} catch (error) {
		logger.error(error, "Failed to broadcast state from message");
	}
}

/**
 * Persists a user-code log entry into DO SQLite storage and fans it out to
 * watcher WebSockets. Throttles the overflow-cleanup DELETE by both write
 * count and wall clock — running it every N writes burned DO rows-read on
 * chatty scripts.
 */
export function persistAndBroadcastLog(
	ctx: DurableObjectState,
	state: LogStreamState,
	level: string,
	message: string,
): void {
	if (!VALID_LOG_LEVELS.includes(level as LogLevel)) return;
	ensureLogsTable(ctx.storage.sql, state);
	const truncated =
		message.length > LOG_MESSAGE_MAX_LENGTH
			? message.slice(0, LOG_MESSAGE_MAX_LENGTH)
			: message;
	const id = crypto.randomUUID();
	const now = Date.now();
	ctx.storage.sql.exec(
		"INSERT INTO device_logs (id, level, message, created_at) VALUES (?, ?, ?, ?)",
		id,
		level,
		truncated,
		now,
	);
	broadcastToWatchers(ctx, "log", {
		id,
		level,
		message: truncated,
		created_at: now,
	});
	state.logWriteCount++;
	if (
		state.logWriteCount % LOG_CLEANUP_INTERVAL === 0 &&
		now - state.lastLogCleanupAt > LOG_CLEANUP_MIN_INTERVAL_MS
	) {
		state.lastLogCleanupAt = now;
		ctx.storage.sql.exec(
			"DELETE FROM device_logs WHERE created_at < ?",
			now - LOG_RETENTION_MS,
		);
		ctx.storage.sql.exec(
			`DELETE FROM device_logs WHERE id NOT IN (
				SELECT id FROM device_logs ORDER BY created_at DESC LIMIT ?
			)`,
			LOG_MAX_STORED,
		);
	}
}

/**
 * Fetches the most recent N log rows (newest first), optionally filtered by
 * level. No cursor — used by the watcher WS backfill where the client just
 * wants "the last N events I might have missed."
 */
export function fetchRecentLogs(
	ctx: DurableObjectState,
	state: LogStreamState,
	opts: { limit: number; level?: string },
): {
	logs: Array<{
		id: string;
		level: string;
		message: string;
		created_at: number;
	}>;
} {
	ensureLogsTable(ctx.storage.sql, state);
	const limit = Math.min(Math.max(opts.limit, 1), 100);
	const rows = opts.level
		? ctx.storage.sql
				.exec(
					`SELECT id, level, message, created_at FROM device_logs
					 WHERE level = ?
					 ORDER BY created_at DESC, id DESC LIMIT ?`,
					opts.level,
					limit,
				)
				.toArray()
		: ctx.storage.sql
				.exec(
					`SELECT id, level, message, created_at FROM device_logs
					 ORDER BY created_at DESC, id DESC LIMIT ?`,
					limit,
				)
				.toArray();
	return {
		logs: rows as Array<{
			id: string;
			level: string;
			message: string;
			created_at: number;
		}>,
	};
}

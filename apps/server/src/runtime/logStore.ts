import type { Database } from "bun:sqlite";
import type { DeviceResponse } from "@devicesdk/core";
import {
	LOG_CLEANUP_INTERVAL,
	LOG_CLEANUP_MIN_INTERVAL_MS,
	LOG_MAX_STORED,
	LOG_MESSAGE_MAX_LENGTH,
	LOG_RETENTION_MS,
	type LogLevel,
	VALID_LOG_LEVELS,
} from "../foundation/consts";
import { logger } from "../foundation/logger";
import type { LogEntry, RuntimeSocket } from "./types";

// Per-session log bookkeeping (throttles the overflow cleanup).
export interface LogStreamState {
	logWriteCount: number;
	lastLogCleanupAt: number;
}

/** Fans an event out to every attached watcher socket. */
export function broadcastToWatchers(
	watchers: Set<RuntimeSocket>,
	event: string,
	data: unknown,
): void {
	if (watchers.size === 0) return;
	const msg = JSON.stringify({ event, data });
	for (const ws of watchers) {
		try {
			ws.send(msg);
		} catch {
			// client gone; close handler removes it from the set
		}
	}
}

export function emitStatusEvent(
	watchers: Set<RuntimeSocket>,
	status: { connected: boolean; connectedSince: number | null },
): void {
	broadcastToWatchers(watchers, "status", status);
}

/**
 * Emits a structured `state` event to watchers for well-known hardware
 * messages. Unknown message types are ignored here and still flow through the
 * normal user-script `onMessage` path.
 */
export function broadcastStateFromMessage(
	watchers: Set<RuntimeSocket>,
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
				broadcastToWatchers(watchers, "state", {
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
				broadcastToWatchers(watchers, "state", {
					entity_id: `gpio_pin_${pin}_analog`,
					value,
					source: "pin_state_update",
				});
				break;
			}
			case "temperature_result": {
				const { celsius } = message.payload as { celsius: number };
				broadcastToWatchers(watchers, "state", {
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
 * Persists a user-code log entry into the device_logs table and fans it out
 * to watcher sockets. Throttles the overflow-cleanup DELETE by both write
 * count and wall clock, matching the cloud implementation's constants.
 */
export function persistAndBroadcastLog(
	db: Database,
	deviceId: string,
	watchers: Set<RuntimeSocket>,
	state: LogStreamState,
	level: string,
	message: string,
): void {
	if (!VALID_LOG_LEVELS.includes(level as LogLevel)) return;
	const truncated =
		message.length > LOG_MESSAGE_MAX_LENGTH
			? message.slice(0, LOG_MESSAGE_MAX_LENGTH)
			: message;
	const id = crypto.randomUUID();
	const now = Date.now();
	db.query(
		"INSERT INTO device_logs (id, device_id, level, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
	).run(id, deviceId, level, truncated, now);
	broadcastToWatchers(watchers, "log", {
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
		db.query(
			"DELETE FROM device_logs WHERE device_id = ?1 AND created_at < ?2",
		).run(deviceId, now - LOG_RETENTION_MS);
		db.query(
			`DELETE FROM device_logs WHERE device_id = ?1 AND id NOT IN (
				SELECT id FROM device_logs WHERE device_id = ?1 ORDER BY created_at DESC LIMIT ?2
			)`,
		).run(deviceId, LOG_MAX_STORED);
	}
}

/**
 * Fetches the most recent N log rows (newest first), optionally filtered by
 * level. No cursor — used by the watcher WS backfill where the client just
 * wants "the last N events I might have missed."
 */
export function fetchRecentLogs(
	db: Database,
	deviceId: string,
	opts: { limit: number; level?: string },
): { logs: LogEntry[] } {
	const limit = Math.min(Math.max(opts.limit, 1), 100);
	const rows = opts.level
		? db
				.query(
					`SELECT id, level, message, created_at FROM device_logs
					 WHERE device_id = ?1 AND level = ?2
					 ORDER BY created_at DESC, id DESC LIMIT ?3`,
				)
				.all(deviceId, opts.level, limit)
		: db
				.query(
					`SELECT id, level, message, created_at FROM device_logs
					 WHERE device_id = ?1
					 ORDER BY created_at DESC, id DESC LIMIT ?2`,
				)
				.all(deviceId, limit);
	return { logs: rows as LogEntry[] };
}

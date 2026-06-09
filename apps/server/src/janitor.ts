import type { BunSqliteQB } from "./db/bunSqliteQB";
import { logger } from "./foundation/logger";

export const JANITOR_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * In-process housekeeping — replaces the cloud deployment's scheduled cron.
 * Runs at boot and then hourly: drops expired sessions and CLI auth codes.
 * (Device log/usage retention is enforced by the device runtime.)
 */
export function runJanitor(qb: BunSqliteQB): void {
	const now = Date.now();
	try {
		qb.db.query("DELETE FROM user_sessions WHERE expires_at < ?1").run(now);
		qb.db.query("DELETE FROM cli_auth_codes WHERE expires_at < ?1").run(now);
	} catch (error) {
		logger.error(error as Error, "Janitor run failed");
	}
}

export function startJanitor(qb: BunSqliteQB): ReturnType<typeof setInterval> {
	runJanitor(qb);
	return setInterval(() => runJanitor(qb), JANITOR_INTERVAL_MS);
}

import type { BunSqliteQB } from "./db/bunSqliteQB";
import { LOG_RETENTION_MS } from "./foundation/consts";
import { logger } from "./foundation/logger";
import { USAGE_RETENTION_MS } from "./foundation/usageMetrics";

export const JANITOR_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * In-process housekeeping — replaces the cloud deployment's scheduled cron.
 * Runs at boot and then hourly: drops expired sessions, expired CLI auth
 * codes, device logs past retention, and usage buckets past the longest
 * metrics window.
 */
export function runJanitor(qb: BunSqliteQB): void {
	const now = Date.now();
	try {
		qb.db.query("DELETE FROM user_sessions WHERE expires_at < ?1").run(now);
		qb.db.query("DELETE FROM cli_auth_codes WHERE expires_at < ?1").run(now);
		qb.db
			.query("DELETE FROM device_logs WHERE created_at < ?1")
			.run(now - LOG_RETENTION_MS);
		qb.db
			.query("DELETE FROM device_usage WHERE bucket_ts < ?1")
			.run(now - USAGE_RETENTION_MS);
	} catch (error) {
		logger.error(error as Error, "Janitor run failed");
	}
}

export function startJanitor(qb: BunSqliteQB): ReturnType<typeof setInterval> {
	runJanitor(qb);
	return setInterval(() => runJanitor(qb), JANITOR_INTERVAL_MS);
}

import type { Database } from "bun:sqlite";

export type MetricsWindow = "1h" | "12h" | "7d";

interface WindowConfig {
	/** Total look-back span in seconds. */
	seconds: number;
	/** Time-bucket width in seconds (series granularity). */
	bucketSeconds: number;
}

export const WINDOWS: Record<MetricsWindow, WindowConfig> = {
	"1h": { seconds: 3600, bucketSeconds: 300 }, // 12 × 5-min buckets
	"12h": { seconds: 43_200, bucketSeconds: 1_800 }, // 24 × 30-min buckets
	"7d": { seconds: 604_800, bucketSeconds: 21_600 }, // 28 × 6-hour buckets
};

/** Storage granularity - finest bucket any window uses. */
export const STORAGE_BUCKET_MS = 300_000;

/** How long usage rows are kept (longest window). */
export const USAGE_RETENTION_MS = WINDOWS["7d"].seconds * 1000;

export interface UsageTotals {
	messagesIn: number;
	messagesOut: number;
	bytesIn: number;
	bytesOut: number;
	cronFires: number;
	connectedSeconds: number;
}

/** One time bucket of usage. `ts` is the bucket start in epoch milliseconds. */
export interface UsageBucket extends UsageTotals {
	ts: number;
}

/** A usage bucket tagged with the device it belongs to (project queries). */
export interface DeviceUsageBucket extends UsageBucket {
	deviceId: string;
}

export function emptyTotals(): UsageTotals {
	return {
		messagesIn: 0,
		messagesOut: 0,
		bytesIn: 0,
		bytesOut: 0,
		cronFires: 0,
		connectedSeconds: 0,
	};
}

export function sumTotals(items: UsageTotals[]): UsageTotals {
	const out = emptyTotals();
	for (const item of items) {
		out.messagesIn += item.messagesIn;
		out.messagesOut += item.messagesOut;
		out.bytesIn += item.bytesIn;
		out.bytesOut += item.bytesOut;
		out.cronFires += item.cronFires;
		out.connectedSeconds += item.connectedSeconds;
	}
	return out;
}

export interface UsageDelta {
	deviceId: string;
	projectId: string;
	messagesIn?: number;
	messagesOut?: number;
	bytesIn?: number;
	bytesOut?: number;
	cronFires?: number;
	connectedSeconds?: number;
}

/**
 * Accumulates a usage delta into the current 5-minute bucket. Replaces the
 * Analytics Engine writeDataPoint calls; never throws (metrics must not
 * break the hot path).
 */
export function recordDeviceUsage(db: Database, delta: UsageDelta): void {
	try {
		const bucketTs =
			Math.floor(Date.now() / STORAGE_BUCKET_MS) * STORAGE_BUCKET_MS;
		db.query(
			`INSERT INTO device_usage (device_id, project_id, bucket_ts, messages_in, messages_out, bytes_in, bytes_out, cron_fires, connected_seconds)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
			 ON CONFLICT (device_id, bucket_ts) DO UPDATE SET
				messages_in = messages_in + ?4,
				messages_out = messages_out + ?5,
				bytes_in = bytes_in + ?6,
				bytes_out = bytes_out + ?7,
				cron_fires = cron_fires + ?8,
				connected_seconds = connected_seconds + ?9`,
		).run(
			delta.deviceId,
			delta.projectId,
			bucketTs,
			delta.messagesIn ?? 0,
			delta.messagesOut ?? 0,
			delta.bytesIn ?? 0,
			delta.bytesOut ?? 0,
			delta.cronFires ?? 0,
			delta.connectedSeconds ?? 0,
		);
	} catch {
		// Best-effort - usage accounting must never break device traffic.
	}
}

interface SeriesRow {
	ts: number;
	messages_in: number;
	messages_out: number;
	bytes_in: number;
	bytes_out: number;
	cron_fires: number;
	connected_seconds: number;
}

function rowToBucket(row: SeriesRow): UsageBucket {
	return {
		ts: row.ts,
		messagesIn: row.messages_in,
		messagesOut: row.messages_out,
		bytesIn: row.bytes_in,
		bytesOut: row.bytes_out,
		cronFires: row.cron_fires,
		connectedSeconds: row.connected_seconds,
	};
}

export function fetchDeviceSeries(
	db: Database,
	deviceId: string,
	window: MetricsWindow,
): UsageBucket[] {
	const cfg = WINDOWS[window];
	const since = Date.now() - cfg.seconds * 1000;
	const bucketMs = cfg.bucketSeconds * 1000;
	const rows = db
		.query(
			`SELECT (bucket_ts / ?3) * ?3 AS ts,
				SUM(messages_in) AS messages_in, SUM(messages_out) AS messages_out,
				SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
				SUM(cron_fires) AS cron_fires, SUM(connected_seconds) AS connected_seconds
			 FROM device_usage
			 WHERE device_id = ?1 AND bucket_ts >= ?2
			 GROUP BY ts ORDER BY ts`,
		)
		.all(deviceId, since, bucketMs) as SeriesRow[];
	return rows.map(rowToBucket);
}

export function fetchProjectSeries(
	db: Database,
	projectId: string,
	window: MetricsWindow,
): DeviceUsageBucket[] {
	const cfg = WINDOWS[window];
	const since = Date.now() - cfg.seconds * 1000;
	const bucketMs = cfg.bucketSeconds * 1000;
	const rows = db
		.query(
			`SELECT device_id, (bucket_ts / ?3) * ?3 AS ts,
				SUM(messages_in) AS messages_in, SUM(messages_out) AS messages_out,
				SUM(bytes_in) AS bytes_in, SUM(bytes_out) AS bytes_out,
				SUM(cron_fires) AS cron_fires, SUM(connected_seconds) AS connected_seconds
			 FROM device_usage
			 WHERE project_id = ?1 AND bucket_ts >= ?2
			 GROUP BY device_id, ts ORDER BY ts`,
		)
		.all(projectId, since, bucketMs) as (SeriesRow & { device_id: string })[];
	return rows.map((row) => ({ ...rowToBucket(row), deviceId: row.device_id }));
}

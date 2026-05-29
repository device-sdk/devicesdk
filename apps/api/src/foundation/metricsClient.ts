// Reads per-device usage back out of the `devicesdk_usage` Analytics Engine
// dataset via Cloudflare's Analytics Engine SQL HTTP API. Writes happen in
// foundation/analytics.ts (recordDeviceUsage); this is the read side.
//
// AE adaptively samples under load, so every aggregate multiplies the metric by
// `_sample_interval` to reconstruct an estimated true total. Numbers are
// estimates, suitable for trend charts and "estimated" billing.
//
// Graceful degradation: when CLOUDFLARE_ACCOUNT_ID / CF_ANALYTICS_API_TOKEN are
// unset (local dev, tests, or before the secret is provisioned) every query
// returns an empty result set rather than throwing, so the endpoints still
// respond with a well-formed (empty) series.

import type { Env } from "../types";
import { logger } from "./logger";
import { EMPTY_USAGE_TOTALS, type UsageTotals } from "./pricing";

export const USAGE_DATASET = "devicesdk_usage";

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

/** Fixed 30-day daily window used for the project billing chart. */
export const BILLING_WINDOW: WindowConfig = {
	seconds: 2_592_000,
	bucketSeconds: 86_400,
};

/** One time bucket of usage. `ts` is the bucket start in epoch milliseconds. */
export interface UsageBucket extends UsageTotals {
	ts: number;
}

/** A usage bucket tagged with the device it belongs to (project-wide queries). */
export interface DeviceUsageBucket extends UsageBucket {
	deviceId: string;
}

// IDs are interpolated directly into SQL (the AE SQL API has no parameter
// binding). Our deviceId/projectId are DB UUIDs, but guard defensively so a
// future caller can't smuggle SQL through this surface.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function assertSafeId(id: string): void {
	if (!SAFE_ID.test(id)) {
		throw new Error(`Unsafe identifier for Analytics Engine query: ${id}`);
	}
}

// Aggregate the six usage doubles, each scaled by the sample interval. Shared by
// every query so column aliases stay consistent with parseTotals().
const USAGE_AGGREGATES = [
	"sum(double1 * _sample_interval) AS messagesIn",
	"sum(double2 * _sample_interval) AS messagesOut",
	"sum(double3 * _sample_interval) AS bytesIn",
	"sum(double4 * _sample_interval) AS bytesOut",
	"sum(double5 * _sample_interval) AS cronFires",
	"sum(double6 * _sample_interval) AS connectedSeconds",
].join(", ");

/** `intDiv(epochSeconds, width) * width` floors a timestamp to its bucket start. */
function bucketExpr(bucketSeconds: number): string {
	return `intDiv(toUInt32(timestamp), ${bucketSeconds}) * ${bucketSeconds} AS ts`;
}

// --- Query builders (pure; unit-tested by asserting the produced SQL) --------

/** Per-device time series: one row per time bucket for a single device. */
export function buildDeviceSeriesQuery(
	deviceId: string,
	window: WindowConfig,
	startSec: number,
): string {
	assertSafeId(deviceId);
	return [
		`SELECT ${bucketExpr(window.bucketSeconds)}, ${USAGE_AGGREGATES}`,
		`FROM ${USAGE_DATASET}`,
		`WHERE index1 = '${deviceId}' AND timestamp >= toDateTime(${startSec})`,
		"GROUP BY ts ORDER BY ts ASC",
	].join(" ");
}

/** Project time series: one row per (device, time bucket) across the project. */
export function buildProjectSeriesQuery(
	projectId: string,
	window: WindowConfig,
	startSec: number,
): string {
	assertSafeId(projectId);
	return [
		`SELECT index1 AS deviceId, ${bucketExpr(window.bucketSeconds)}, ${USAGE_AGGREGATES}`,
		`FROM ${USAGE_DATASET}`,
		`WHERE blob1 = '${projectId}' AND timestamp >= toDateTime(${startSec})`,
		"GROUP BY deviceId, ts ORDER BY ts ASC",
	].join(" ");
}

/** Project-wide daily totals (summed across all devices) for the billing chart. */
export function buildProjectBillingQuery(
	projectId: string,
	startSec: number,
): string {
	assertSafeId(projectId);
	return [
		`SELECT ${bucketExpr(BILLING_WINDOW.bucketSeconds)}, ${USAGE_AGGREGATES}`,
		`FROM ${USAGE_DATASET}`,
		`WHERE blob1 = '${projectId}' AND timestamp >= toDateTime(${startSec})`,
		"GROUP BY ts ORDER BY ts ASC",
	].join(" ");
}

// --- Parsing -----------------------------------------------------------------

function num(value: unknown): number {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : 0;
}

/** Pull the six usage doubles out of a raw AE row into a UsageTotals. */
export function parseTotals(row: Record<string, unknown>): UsageTotals {
	return {
		messagesIn: num(row.messagesIn),
		messagesOut: num(row.messagesOut),
		bytesIn: num(row.bytesIn),
		bytesOut: num(row.bytesOut),
		cronFires: num(row.cronFires),
		connectedSeconds: num(row.connectedSeconds),
	};
}

function parseBucket(row: Record<string, unknown>): UsageBucket {
	// `ts` comes back as epoch seconds; the API surfaces milliseconds.
	return { ts: num(row.ts) * 1000, ...parseTotals(row) };
}

/** Sum a list of totals into one. */
export function sumTotals(items: UsageTotals[]): UsageTotals {
	return items.reduce<UsageTotals>(
		(acc, t) => ({
			messagesIn: acc.messagesIn + t.messagesIn,
			messagesOut: acc.messagesOut + t.messagesOut,
			bytesIn: acc.bytesIn + t.bytesIn,
			bytesOut: acc.bytesOut + t.bytesOut,
			cronFires: acc.cronFires + t.cronFires,
			connectedSeconds: acc.connectedSeconds + t.connectedSeconds,
		}),
		{ ...EMPTY_USAGE_TOTALS },
	);
}

// --- SQL API transport -------------------------------------------------------

async function runSql(
	env: Env,
	sql: string,
): Promise<Record<string, unknown>[]> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const token = env.CF_ANALYTICS_API_TOKEN;
	if (!accountId || !token) return [];

	try {
		const resp = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "text/plain",
				},
				body: sql,
			},
		);
		if (!resp.ok) {
			logger.warn("Analytics Engine SQL query failed", {
				status: resp.status,
			});
			return [];
		}
		const json = (await resp.json()) as { data?: Record<string, unknown>[] };
		return json.data ?? [];
	} catch (err) {
		logger.error(err, "Analytics Engine SQL query threw");
		return [];
	}
}

// --- High-level fetchers (used by the endpoints) -----------------------------

function startSecFor(spanSeconds: number): number {
	return Math.floor(Date.now() / 1000) - spanSeconds;
}

/** Time-bucketed usage for one device over the given window. */
export async function fetchDeviceSeries(
	env: Env,
	deviceId: string,
	window: MetricsWindow,
): Promise<UsageBucket[]> {
	const cfg = WINDOWS[window];
	const rows = await runSql(
		env,
		buildDeviceSeriesQuery(deviceId, cfg, startSecFor(cfg.seconds)),
	);
	return rows.map(parseBucket);
}

/** Time-bucketed usage for every device in a project over the given window. */
export async function fetchProjectSeries(
	env: Env,
	projectId: string,
	window: MetricsWindow,
): Promise<DeviceUsageBucket[]> {
	const cfg = WINDOWS[window];
	const rows = await runSql(
		env,
		buildProjectSeriesQuery(projectId, cfg, startSecFor(cfg.seconds)),
	);
	return rows.map((row) => ({
		deviceId: String(row.deviceId ?? ""),
		...parseBucket(row),
	}));
}

/** Project-wide daily totals over the trailing 30 days (billing chart). */
export async function fetchProjectBilling(
	env: Env,
	projectId: string,
): Promise<UsageBucket[]> {
	const rows = await runSql(
		env,
		buildProjectBillingQuery(projectId, startSecFor(BILLING_WINDOW.seconds)),
	);
	return rows.map(parseBucket);
}

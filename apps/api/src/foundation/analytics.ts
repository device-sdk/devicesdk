// Thin wrapper around env.ANALYTICS.writeDataPoint. Each event kind has a
// fixed indexes/blobs/doubles layout so the resulting Workers Analytics Engine
// dataset is queryable without per-call schema reasoning.
//
// indexes[0] is always the event kind so dashboards can filter by family
// before scanning blobs/doubles. Workers Analytics Engine allows one index
// of ≤96 bytes; everything else is in blobs (string) or doubles (number).
//
// Defensive guarantees:
// - If env.ANALYTICS is undefined (e.g. local dev or test miniflare), all
//   recorders are no-ops.
// - writeDataPoint failures are swallowed and logged. Analytics must never
//   break a request.

export interface CommandRpcEvent {
	commandType: string;
	outcome: "ack" | "error" | "timeout" | "fire_and_forget";
	latencyMs: number;
	ackReceived: boolean;
	deviceId?: string;
	projectId?: string;
}

export interface ScriptInitEvent {
	source: "runtime" | "validator";
	initLatencyMs: number;
	deviceId?: string;
	projectId?: string;
	versionId?: string;
}

export interface LoaderFailureEvent {
	failureKind:
		| "transient"
		| "persistent"
		| "validator_timeout"
		| "validator_error";
	errorName?: string;
	attemptCount?: number;
	deviceId?: string;
	projectId?: string;
}

// --- Usage / billing metrics -------------------------------------------------
//
// Written to the separate `USAGE` dataset (devicesdk_usage), indexed by
// deviceId so each device's high-volume stream is sampled independently and the
// per-device dashboard query is a fast `WHERE index1 = ?`. The project page
// aggregates with `WHERE blob1 = <projectId> GROUP BY index1`.
//
// Fixed column layout (every data point uses the same shape; each event kind
// populates the relevant doubles and leaves the rest at 0, so read queries can
// `sum(doubleN * _sample_interval)` per metric without branching on kind):
//
//   indexes[0] = deviceId
//   blobs      = [projectId, userId, kind]
//   doubles    = [messagesIn, messagesOut, bytesIn, bytesOut,
//                 cronFires, connectedSeconds]
//
// AE adaptively samples under load, so totals are reconstructed with
// `sum(doubleN * _sample_interval)` — these numbers are estimates, suitable for
// trend charts and "estimated" billing, not exact-to-the-cent accounting.

export type DeviceUsageKind =
	| "message_in"
	| "message_out"
	| "cron_fire"
	| "connection";

export interface DeviceUsageEvent {
	deviceId: string;
	projectId: string;
	userId?: string;
	kind: DeviceUsageKind;
	messagesIn?: number;
	messagesOut?: number;
	bytesIn?: number;
	bytesOut?: number;
	cronFires?: number;
	connectedSeconds?: number;
}

function safeWrite(
	analytics: AnalyticsEngineDataset | undefined,
	kind: string,
	point: AnalyticsEngineDataPoint,
): void {
	if (!analytics) return;
	try {
		analytics.writeDataPoint(point);
	} catch (err) {
		console.error(`Analytics writeDataPoint failed (${kind}):`, err);
	}
}

export function recordCommandRpc(
	analytics: AnalyticsEngineDataset | undefined,
	event: CommandRpcEvent,
): void {
	safeWrite(analytics, "command_rpc", {
		indexes: ["command_rpc"],
		blobs: [
			event.deviceId ?? "",
			event.projectId ?? "",
			event.commandType,
			event.outcome,
		],
		doubles: [event.latencyMs, event.ackReceived ? 1 : 0],
	});
}

export function recordScriptInit(
	analytics: AnalyticsEngineDataset | undefined,
	event: ScriptInitEvent,
): void {
	safeWrite(analytics, "script_init", {
		indexes: ["script_init"],
		blobs: [
			event.deviceId ?? "",
			event.projectId ?? "",
			event.versionId ?? "",
			event.source,
		],
		doubles: [event.initLatencyMs],
	});
}

export function recordWorkerLoaderFailure(
	analytics: AnalyticsEngineDataset | undefined,
	event: LoaderFailureEvent,
): void {
	safeWrite(analytics, "loader_failure", {
		indexes: ["loader_failure"],
		blobs: [
			event.deviceId ?? "",
			event.projectId ?? "",
			event.failureKind,
			event.errorName ?? "",
		],
		doubles: [event.attemptCount ?? 1],
	});
}

/**
 * Record a per-device usage data point to the `USAGE` dataset. Indexed by
 * deviceId (see the layout comment above DeviceUsageEvent). No-op when the
 * binding is absent (local/test) or deviceId is missing — analytics must never
 * break the device hot path.
 */
export function recordDeviceUsage(
	usage: AnalyticsEngineDataset | undefined,
	event: DeviceUsageEvent,
): void {
	if (!usage || !event.deviceId) return;
	safeWrite(usage, "device_usage", {
		indexes: [event.deviceId],
		blobs: [event.projectId, event.userId ?? "", event.kind],
		doubles: [
			event.messagesIn ?? 0,
			event.messagesOut ?? 0,
			event.bytesIn ?? 0,
			event.bytesOut ?? 0,
			event.cronFires ?? 0,
			event.connectedSeconds ?? 0,
		],
	});
}

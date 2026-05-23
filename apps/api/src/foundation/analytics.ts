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

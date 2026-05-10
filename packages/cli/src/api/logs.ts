import { getApiUrl } from "./shared.js";

// Logs — over the watcher WebSocket. The HTTP /logs endpoint was retired in
// May 2026 (returns 410 with a Link header pointing here). See the comment
// block on `BaseDevice.getLogs` in apps/api/src/durableObjects/lib/device.ts.
export interface LogEntry {
	id: string;
	level: string;
	message: string;
	created_at: number;
}

/**
 * Builds the `ws://` or `wss://` URL for the watcher WebSocket. Mirrors the
 * dashboard helper in apps/dashboard/src/services/api.service.ts. The scheme
 * is derived from the configured API URL — local dev (http://) gets ws://,
 * everything else gets wss://.
 */
export function getWatchUrl(
	projectId: string,
	deviceId: string,
	options?: { backfillLimit?: number; backfillLevel?: string },
): string {
	const apiUrl = getApiUrl();
	const base = apiUrl.startsWith("http://")
		? apiUrl.replace("http://", "ws://")
		: apiUrl.replace("https://", "wss://");
	const url = `${base}/v1/projects/${projectId}/devices/${deviceId}/watch`;
	const params = new URLSearchParams();
	if (options?.backfillLimit != null) {
		params.set("backfillLimit", String(options.backfillLimit));
	}
	if (options?.backfillLevel) {
		params.set("backfillLevel", options.backfillLevel);
	}
	const qs = params.toString();
	return qs ? `${url}?${qs}` : url;
}

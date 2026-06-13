import type { Env } from "../types";
import { getDeviceStub } from "./deviceHandle";

export interface DeviceStatusResult {
	connected: boolean;
	connectedSince: number | null;
}

/**
 * Retrieves the live WebSocket connection status of a device from its in-process session.
 * Mirrors the pattern from deviceReboot.ts.
 */
export async function getDeviceConnectionStatus(
	env: Env,
	projectId: string,
	deviceId: string,
): Promise<DeviceStatusResult> {
	const stub = getDeviceStub(env, projectId, deviceId);

	try {
		return await stub.getConnectionStatus();
	} catch (err) {
		// Most common case: session not yet initialized (device has never connected).
		// Log at debug level — this is expected, not an error condition.
		// Genuine RPC failures also land here; inspect `err` to escalate if needed.
		console.debug(
			`getDeviceConnectionStatus: device session unreachable for ${deviceId} in ${projectId} — likely never connected`,
			err,
		);
		return { connected: false, connectedSince: null };
	}
}

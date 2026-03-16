import type { Env } from "../types";

export interface DeviceStatusResult {
	connected: boolean;
	connectedSince: number | null;
}

/**
 * Retrieves the live WebSocket connection status of a device from its Durable Object.
 * Mirrors the pattern from deviceReboot.ts.
 */
export async function getDeviceConnectionStatus(
	env: Env,
	projectId: string,
	deviceId: string,
): Promise<DeviceStatusResult> {
	const doName = `${projectId}:${deviceId}`;
	const durableObjectId = env.DEVICE.idFromName(doName);
	const stub = env.DEVICE.get(durableObjectId) as unknown as {
		getConnectionStatus(): Promise<DeviceStatusResult>;
	};

	try {
		return await stub.getConnectionStatus();
	} catch (err) {
		// Most common case: DO not yet initialized (device has never connected).
		// Log at debug level — this is expected, not an error condition.
		// Genuine RPC failures also land here; inspect `err` to escalate if needed.
		console.debug(
			`getDeviceConnectionStatus: DO unreachable for ${deviceId} in ${projectId} — likely never connected`,
			err,
		);
		return { connected: false, connectedSince: null };
	}
}

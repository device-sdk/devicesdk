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
	} catch {
		// DO unreachable (never initialized) — device has never connected
		return { connected: false, connectedSince: null };
	}
}

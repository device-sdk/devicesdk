import type { BaseDevice } from "../durableObjects/lib/device";
import type { Env } from "../types";

/**
 * Returns a typed Durable Object stub for a device.
 * Centralizes the `as unknown as BaseDevice` cast in one place.
 */
export function getDeviceStub(
	env: Env,
	projectId: string,
	deviceId: string,
): BaseDevice {
	const doName = `${projectId}:${deviceId}`;
	const id = env.DEVICE.idFromName(doName);
	return env.DEVICE.get(id) as unknown as BaseDevice;
}

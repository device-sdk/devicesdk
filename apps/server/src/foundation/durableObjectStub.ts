import type { DeviceHandle } from "../runtime/deviceHub";
import type { Env } from "../types";

/**
 * Returns the in-process device handle for a device. Kept under the old name
 * (this used to resolve a Durable Object stub) so call sites are unchanged.
 */
export function getDeviceStub(
	env: Env,
	projectId: string,
	deviceId: string,
): DeviceHandle {
	return env.DEVICE.get(projectId, deviceId);
}

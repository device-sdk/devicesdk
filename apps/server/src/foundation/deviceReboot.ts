import type { Env } from "../types";
import { getDeviceStub } from "./deviceHandle";
import { logger } from "./logger";

export interface RebootResult {
	rebooted: boolean;
	reason: string;
}

/**
 * Triggers a device reboot by calling the in-process device session's RPC method.
 * Used after script upload/deploy to make the device load the new version.
 */
export async function triggerDeviceReboot(
	env: Env,
	projectId: string,
	deviceId: string,
): Promise<RebootResult> {
	const sessionKey = `${projectId}:${deviceId}`;
	logger.debug("[reboot] Triggering reboot for device session", { sessionKey });
	const stub = getDeviceStub(env, projectId, deviceId);

	try {
		const result = await stub.triggerRebootForDeploy();
		logger.debug("[reboot] Result", { result });
		return result;
	} catch (error) {
		const reason = `Failed to contact device session: ${(error as Error).message}`;
		logger.error(error, "[reboot] Failed to contact device session", {
			sessionKey,
		});
		return { rebooted: false, reason };
	}
}

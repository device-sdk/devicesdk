import type { Env } from "../types";

export interface RebootResult {
	rebooted: boolean;
	reason: string;
}

/**
 * Triggers a device reboot by calling the Durable Object's RPC method.
 * Used after script upload/deploy to make the device load the new version.
 */
export async function triggerDeviceReboot(
	env: Env,
	projectId: string,
	deviceId: string,
): Promise<RebootResult> {
	const doName = `${projectId}:${deviceId}`;
	console.log(`[reboot] Triggering reboot for DO: ${doName}`);
	const durableObjectId = env.DEVICE.idFromName(doName);
	const stub = env.DEVICE.get(durableObjectId) as unknown as {
		triggerRebootForDeploy(): Promise<RebootResult>;
	};

	try {
		const result = await stub.triggerRebootForDeploy();
		console.log(`[reboot] Result:`, JSON.stringify(result));
		return result;
	} catch (error) {
		const reason = `Failed to contact DO: ${(error as Error).message}`;
		console.error(`[reboot] Error:`, reason);
		return { rebooted: false, reason };
	}
}

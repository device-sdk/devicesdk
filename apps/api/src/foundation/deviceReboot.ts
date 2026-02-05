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
	const durableObjectId = env.DEVICE.idFromName(doName);
	const stub = env.DEVICE.get(durableObjectId) as unknown as {
		triggerRebootForDeploy(): Promise<RebootResult>;
	};

	try {
		return await stub.triggerRebootForDeploy();
	} catch (error) {
		return {
			rebooted: false,
			reason: `Failed to contact DO: ${(error as Error).message}`,
		};
	}
}

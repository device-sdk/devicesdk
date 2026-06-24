import type { Database } from "bun:sqlite";
import { MAX_CALL_DEPTH } from "./rpcConstants";
import type { BridgeFn } from "./scriptHost";
import type { DeviceMeta } from "./types";

export interface BridgeTarget {
	handleRemoteCall(request: {
		methodName: string;
		args: unknown[];
		callDepth: number;
		scriptMeta: DeviceMeta;
	}): Promise<unknown>;
}

export interface BridgeDeps {
	db: Database;
	getSession(projectId: string, deviceId: string): BridgeTarget;
}

/**
 * Inter-device RPC dispatcher - the in-process port of the DevicesBridge
 * WorkerEntrypoint. User code calls `this.env.DEVICES["slug"].method()`;
 * this resolves the slug within the caller's project and invokes the target
 * session's script instance directly.
 *
 * SECURITY NOTE - trust model unchanged from the cloud implementation: all
 * devices within a project can call any non-blocked method on any other
 * device in the same project. Projects are single-tenant by design.
 */
export function makeBridge(deps: BridgeDeps, callerMeta: DeviceMeta): BridgeFn {
	return async (targetDeviceSlug, methodName, args, callDepth) => {
		if (callDepth >= MAX_CALL_DEPTH) {
			throw new Error(
				`Inter-device RPC call depth limit (${MAX_CALL_DEPTH}) exceeded. ` +
					"This usually means devices are calling each other in a cycle.",
			);
		}

		const device = deps.db
			.query(
				`SELECT d.id, d.current_version_id, ds.entrypoint
				 FROM devices d
				 LEFT JOIN device_scripts ds ON ds.version_id = d.current_version_id
				 WHERE d.project_id = ?1 AND d.device_slug = ?2`,
			)
			.get(callerMeta.projectId, targetDeviceSlug) as {
			id: string;
			current_version_id: string | null;
			entrypoint: string | null;
		} | null;

		if (!device) {
			throw new Error(
				`Device "${targetDeviceSlug}" not found in project "${callerMeta.projectId}"`,
			);
		}
		if (!device.current_version_id || !device.entrypoint) {
			throw new Error(`Device "${targetDeviceSlug}" has no deployed script`);
		}

		const target = deps.getSession(callerMeta.projectId, device.id);
		return target.handleRemoteCall({
			methodName,
			args,
			callDepth: callDepth + 1,
			scriptMeta: {
				userId: callerMeta.userId,
				projectId: callerMeta.projectId,
				deviceId: device.id,
				// Same project as the caller; slugs locate the script blob.
				projectSlug: callerMeta.projectSlug,
				deviceSlug: targetDeviceSlug,
				versionId: device.current_version_id,
				entrypointName: device.entrypoint,
			},
		});
	};
}

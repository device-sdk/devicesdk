import { WorkerEntrypoint } from "cloudflare:workers";
import { D1QB } from "workers-qb";
import type { BaseDevice } from "./device";
import { MAX_CALL_DEPTH } from "./rpcConstants";

interface DevicesBridgeProps {
	projectId: string;
	userId: string;
}

/**
 * WorkerEntrypoint that enables inter-device RPC.
 * Provided as a binding to dynamic workers so user code can call methods
 * on other devices in the same project via `this.env.DEVICES["slug"].method()`.
 *
 * Follows the same architecture as DeviceSender — a named export from the main
 * worker, accessed via `(this.ctx as any).exports.DevicesBridge(...)` from inside the DO.
 */
export class DevicesBridge extends WorkerEntrypoint<
	{ DB: D1Database; DEVICE: DurableObjectNamespace<BaseDevice> },
	DevicesBridgeProps
> {
	/**
	 * SECURITY NOTE: Inter-device RPC trust model
	 *
	 * All devices within the same project can call any non-blocked method on
	 * any other device in the project. There is no per-device permission system.
	 * This is by design — projects are single-tenant (owned by one user).
	 *
	 * If multi-tenant projects are ever introduced, a per-device method allowlist
	 * or ACL system would be needed here.
	 *
	 * Blocked methods (lifecycle/internal) are enforced in classProxy.ts callMethod handler,
	 * not here. See rpcConstants.ts for the list.
	 */
	async callRemoteMethod(
		targetDeviceSlug: string,
		methodName: string,
		args: unknown[],
		callDepth: number,
	): Promise<unknown> {
		if (callDepth >= MAX_CALL_DEPTH) {
			throw new Error(
				`Inter-device RPC call depth limit (${MAX_CALL_DEPTH}) exceeded. ` +
					"This usually means devices are calling each other in a cycle.",
			);
		}

		const { projectId, userId } = this.ctx.props;

		// Resolve device slug to device record + script metadata
		const qb = new D1QB(this.env.DB);
		const result = await qb
			.fetchOne({
				tableName: "devices d",
				fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
				join: {
					type: "LEFT",
					table: "device_scripts ds",
					on: "ds.version_id = d.current_version_id",
				},
				where: {
					conditions: "d.project_id = ? AND d.device_slug = ?",
					params: [projectId, targetDeviceSlug],
				},
			})
			.execute();

		const device = result.results as
			| {
					id: string;
					current_version_id: string | null;
					entrypoint: string | null;
			  }
			| undefined;

		if (!device) {
			throw new Error(
				`Device "${targetDeviceSlug}" not found in project "${projectId}"`,
			);
		}

		if (!device.current_version_id || !device.entrypoint) {
			throw new Error(`Device "${targetDeviceSlug}" has no deployed script`);
		}

		// Get the DO stub for the target device
		const doName = `${projectId}:${device.id}`;
		const durableObjectId = this.env.DEVICE.idFromName(doName);
		const stub = this.env.DEVICE.get(durableObjectId);

		// Call handleRemoteCall on the target device's DO
		return stub.handleRemoteCall({
			methodName,
			args,
			callDepth: callDepth + 1,
			scriptMeta: {
				userId,
				projectId,
				deviceId: device.id,
				versionId: device.current_version_id,
				entrypointName: device.entrypoint,
			},
		});
	}
}

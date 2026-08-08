import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { logger } from "../../foundation/logger";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext } from "../../types";

export class DeleteDevice extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Delete a device",
		operationId: "devices-delete",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Device deleted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
							device_id: z.string(),
						}),
					}),
				),
			},
			"404": {
				description: "Project or device not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { device } = resolved;

		// These tables have no FK to devices - delete explicitly so deleted
		// devices leave no KV/log/usage orphans behind.
		await c.env.DB.prepare("DELETE FROM device_kv WHERE device_id = ?")
			.bind(device.id)
			.run();
		await c.env.DB.prepare("DELETE FROM device_logs WHERE device_id = ?")
			.bind(device.id)
			.run();
		await c.env.DB.prepare("DELETE FROM device_usage WHERE device_id = ?")
			.bind(device.id)
			.run();

		// Delete the device (cascades to device_scripts and
		// device_entity_configs via FK)
		await qb
			.delete({
				tableName: "devices",
				where: {
					conditions: ["id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		// Best-effort blob cleanup - DB delete already committed. list() pages
		// at 1000 keys, so follow the cursor until every page is drained.
		try {
			const r2 = c.env.SCRIPTS;
			const prefix = `${user.id}/${projectId}/${deviceId}/`;
			let cursor: string | undefined;
			do {
				const listed = await r2.list({ prefix, cursor });
				for (const obj of listed.objects) {
					await r2.delete(obj.key);
				}
				cursor = listed.truncated ? listed.cursor : undefined;
			} while (cursor);
		} catch (err) {
			logger.error(err as Error, "Unhandled error");
		}

		return c.json({
			success: true,
			result: {
				deleted: true,
				device_id: deviceId,
			},
		});
	}
}

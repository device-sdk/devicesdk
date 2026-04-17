import * as Sentry from "@sentry/cloudflare";
import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
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

		// Delete the device (cascades to device_scripts via FK)
		await qb
			.delete({
				tableName: "devices",
				where: {
					conditions: ["id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		// Best-effort R2 cleanup — DB delete already committed
		try {
			const r2 = c.env.SCRIPTS;
			const prefix = `${user.id}/${projectId}/${deviceId}/`;
			const objects = await r2.list({ prefix });
			for (const obj of objects.objects) {
				await r2.delete(obj.key);
			}
		} catch (err) {
			Sentry.captureException(err);
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

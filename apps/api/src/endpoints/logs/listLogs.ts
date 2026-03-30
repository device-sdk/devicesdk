import { contentJson } from "chanfana";
import { z } from "zod";
import type { BaseDevice } from "../../durableObjects/lib/device";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class ListLogs extends BaseRoute {
	public schema = {
		tags: ["Logs"],
		summary: "List device logs",
		operationId: "logs-list",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			query: z.object({
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).optional(),
				level: z.enum(["log", "info", "warn", "error", "debug"]).optional(),
			}),
		},
		responses: {
			"200": {
				description: "Returns device logs",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							logs: z.array(
								z.object({
									id: z.string(),
									level: z.string(),
									message: z.string(),
									created_at: z.number(),
								}),
							),
							next_cursor: z.string().nullable(),
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
		const { cursor, limit, level } = data.query;

		const project = await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["user_id = ?1", "project_slug = ?2"],
					params: [user.id, projectId],
				},
			})
			.execute()
			.then((p) => p.results);

		if (!project) {
			return c.json({ success: false, error: "Project not found" }, 404);
		}

		const device = await qb
			.fetchOne<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1", "device_slug = ?2"],
					params: [project.id, deviceId],
				},
			})
			.execute()
			.then((d) => d.results);

		if (!device) {
			return c.json({ success: false, error: "Device not found" }, 404);
		}

		const doId = c.env.DEVICE.idFromName(`${project.id}:${device.id}`);
		const stub = c.env.DEVICE.get(doId) as unknown as BaseDevice;
		const result = await stub.getLogs({ cursor, limit, level });

		return c.json({ success: true, result });
	}
}

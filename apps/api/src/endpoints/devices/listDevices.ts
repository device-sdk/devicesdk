import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class ListDevices extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "List all devices in a project",
		operationId: "devices-list",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			query: z.object({
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).default(50),
			}),
		},
		responses: {
			"200": {
				description: "Returns a paginated list of devices",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							items: z.array(
								z.object({
									id: z.string(),
									device_id: z.string(),
									name: z.string().nullable(),
									description: z.string().nullable(),
									current_version_id: z.string().nullable(),
									last_connected_at: z.number().nullable(),
									created_at: z.number(),
									updated_at: z.number(),
								}),
							),
							next_cursor: z.string().nullable(),
						}),
					}),
				),
			},
			"404": {
				description: "Project not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;
		const { cursor, limit } = data.query;

		// Find the project
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

		const conditions: string[] = ["project_id = ?1"];
		const params: (string | number)[] = [project.id];

		if (cursor) {
			const decodedCursor = Number(atob(cursor));
			if (Number.isNaN(decodedCursor)) {
				return c.json({ success: false, error: "Invalid cursor" }, 400);
			}
			conditions.push(`created_at < ?${params.length + 1}`);
			params.push(decodedCursor);
		}

		const devicesResult = await qb
			.fetchAll<tableDevices>({
				tableName: "devices",
				where: {
					conditions,
					params,
				},
				orderBy: "created_at DESC",
				limit: limit + 1,
			})
			.execute();
		const devices = devicesResult.results || [];

		let nextCursor: string | null = null;
		if (devices.length > limit) {
			devices.pop();
			const lastItem = devices[devices.length - 1];
			nextCursor = btoa(String(lastItem.created_at));
		}

		return c.json({
			success: true,
			result: {
				items: devices.map((device) => ({
					id: device.id,
					device_id: device.device_slug,
					name: device.name || null,
					description: device.description || null,
					current_version_id: device.current_version_id || null,
					last_connected_at: device.last_connected_at || null,
					created_at: device.created_at,
					updated_at: device.updated_at,
				})),
				next_cursor: nextCursor,
			},
		});
	}
}

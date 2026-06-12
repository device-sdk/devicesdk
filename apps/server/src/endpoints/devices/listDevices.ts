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
				page: z.coerce.number().int().min(1).default(1),
				per_page: z.coerce.number().int().min(1).max(100).default(50),
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
							page: z.number().int(),
							per_page: z.number().int(),
							has_more: z.boolean(),
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
		const { page, per_page } = data.query;

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

		const devicesResult = await qb
			.fetchAll<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1"],
					params: [project.id],
				},
				orderBy: "created_at DESC",
				limit: per_page + 1,
				offset: (page - 1) * per_page,
			})
			.execute();
		const devices = devicesResult.results || [];

		const has_more = devices.length > per_page;
		if (has_more) devices.pop();

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
				page,
				per_page,
				has_more,
			},
		});
	}
}

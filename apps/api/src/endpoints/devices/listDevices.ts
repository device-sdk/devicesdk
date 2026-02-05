import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext, tableDevices, tableProjects } from "../../types";
import { ApiException } from "chanfana";

export class ListDevices extends OpenAPIRoute {
	public schema = {
		tags: ["Devices"],
		summary: "List all devices in a project",
		operationId: "devices-list",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns a list of devices",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
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
			})
			.execute();
		const devices = devicesResult.results || [];

		return c.json({
			success: true,
			result: devices.map((device) => ({
				id: device.id,
				device_id: device.device_slug,
				name: device.name || null,
				description: device.description || null,
				current_version_id: device.current_version_id || null,
				last_connected_at: device.last_connected_at || null,
				created_at: device.created_at,
				updated_at: device.updated_at,
			})),
		});
	}
}

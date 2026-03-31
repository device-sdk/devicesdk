import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { getDeviceConnectionStatus } from "../../foundation/deviceStatus";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class GetProject extends BaseRoute {
	public schema = {
		tags: ["Projects"],
		summary: "Get a single project by ID",
		operationId: "projects-get",
		request: {
			params: z.object({
				projectId: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "Returns a single project with its devices",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							project_slug: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							created_at: z.number(),
							device_count: z.number(),
							devices: z.array(
								z.object({
									device_id: z.string(),
									name: z.string().nullable(),
									status: z.string(),
									last_connected_at: z.number().nullable(),
								}),
							),
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

		// Fetch devices for this project
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

		// Query live connection status from Durable Objects in parallel
		const deviceStatuses = await Promise.all(
			devices.map(async (d) => {
				const status = await getDeviceConnectionStatus(c.env, project.id, d.id);
				return { deviceId: d.id, connected: status.connected };
			}),
		);
		const statusMap = new Map(
			deviceStatuses.map((s) => [s.deviceId, s.connected]),
		);

		return c.json(
			{
				success: true,
				result: {
					id: project.id,
					project_slug: project.project_slug,
					name: project.name || null,
					description: project.description || null,
					created_at: project.created_at,
					device_count: devices.length,
					devices: devices.map((d) => ({
						device_id: d.device_slug,
						name: d.name || null,
						status: statusMap.get(d.id) ? "online" : "offline",
						last_connected_at: d.last_connected_at || null,
					})),
				},
			},
			200,
		);
	}
}

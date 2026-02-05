import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type {
	AppContext,
	tableDevices,
	tableDeviceScripts,
	tableProjects,
} from "../../types";
import { ApiException } from "chanfana";

export class ListVersions extends OpenAPIRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "List all script versions for a device",
		operationId: "scripts-versions-list",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns a list of script versions",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
							z.object({
								version_id: z.string(),
								message: z.string().nullable(),
								is_current: z.boolean(),
								created_at: z.number(),
							}),
						),
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

		// Find the device
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

		// Get all versions for this device, ordered by created_at desc
		const versionsResult = await qb
			.fetchAll<tableDeviceScripts>({
				tableName: "device_scripts",
				where: {
					conditions: ["device_id = ?1"],
					params: [device.id],
				},
				orderBy: {
					created_at: "DESC",
				},
			})
			.execute();
		const versions = versionsResult.results || [];

		return c.json({
			success: true,
			result: versions.map((v: tableDeviceScripts) => ({
				version_id: v.version_id,
				message: v.message || null,
				is_current: v.version_id === device.current_version_id,
				created_at: v.created_at,
			})),
		});
	}
}

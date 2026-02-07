import { ApiException, contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type {
	AppContext,
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../types";

export class GetVersion extends OpenAPIRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "Get a specific script version",
		operationId: "scripts-version-get",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
				versionId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns the script content for the specified version",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							version_id: z.string(),
							message: z.string().nullable(),
							script: z.string(),
							created_at: z.number(),
						}),
					}),
				),
			},
			"404": {
				description: "Project, device, or version not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId, versionId } = data.params;

		// Validate project exists and belongs to user
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

		// Validate device exists
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

		// Validate version exists
		const version = await qb
			.fetchOne<tableDeviceScripts>({
				tableName: "device_scripts",
				where: {
					conditions: ["device_id = ?1", "version_id = ?2"],
					params: [device.id, versionId],
				},
			})
			.execute()
			.then((v) => v.results);

		if (!version) {
			return c.json({ success: false, error: "Version not found" }, 404);
		}

		// Fetch script content from R2
		const r2 = c.env.SCRIPTS;
		const scriptKey = `${user.id}/${projectId}/${deviceId}/${versionId}.js`;
		const scriptObject = await r2.get(scriptKey);

		if (!scriptObject) {
			return c.json(
				{ success: false, error: "Script file not found in storage" },
				404,
			);
		}

		const script = await scriptObject.text();

		return c.json({
			success: true,
			result: {
				version_id: version.version_id,
				message: version.message || null,
				script,
				created_at: version.created_at,
			},
		});
	}
}

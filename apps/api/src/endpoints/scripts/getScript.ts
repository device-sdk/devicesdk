import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class GetScript extends BaseRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "Get the current deployed script for a device",
		operationId: "scripts-get",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns the current script",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							version_id: z.string().nullable(),
							script: z.string(),
						}),
					}),
				),
			},
			"404": {
				description: "Project, device, or script not found",
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

		// Get the script from R2
		const r2 = c.env.SCRIPTS;
		const scriptObj = await r2.get(
			`${user.id}/${projectId}/${deviceId}/latest.js`,
		);

		if (!scriptObj) {
			return c.json(
				{ success: false, error: "No script uploaded for this device" },
				404,
			);
		}

		const script = await scriptObj.text();

		return c.json({
			success: true,
			result: {
				version_id: device.current_version_id || null,
				script: script,
			},
		});
	}
}

import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type {
	AppContext,
	tableDevices,
	tableDeviceScripts,
	tableProjects,
} from "../../types";
import { triggerDeviceReboot } from "../../foundation/deviceReboot";

export class DeployVersion extends OpenAPIRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "Deploy a specific script version (rollback)",
		operationId: "scripts-deploy",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
				versionId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Version deployed successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							version_id: z.string(),
							device_id: z.string(),
							deployed_at: z.number(),
							device_rebooted: z.boolean(),
							reboot_reason: z.string(),
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

		// Verify the version exists
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

		const r2 = c.env.SCRIPTS;

		// Get the script from R2 for this version
		const scriptObj = await r2.get(
			`${user.id}/${projectId}/${deviceId}/${versionId}.js`,
		);
		if (!scriptObj) {
			return c.json(
				{ success: false, error: "Script file not found in storage" },
				404,
			);
		}

		const script = await scriptObj.text();

		// Update latest.js with this version's script
		await r2.put(`${user.id}/${projectId}/${deviceId}/latest.js`, script);

		const now = Date.now();

		// Update the device's current_version_id
		await qb
			.update({
				tableName: "devices",
				data: {
					current_version_id: versionId,
					updated_at: now,
				},
				where: {
					conditions: ["id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		// Trigger device reboot so it loads the deployed script version
		const rebootResult = await triggerDeviceReboot(
			c.env,
			project.id,
			device.id,
		);

		return c.json({
			success: true,
			result: {
				version_id: versionId,
				device_id: deviceId,
				deployed_at: now,
				device_rebooted: rebootResult.rebooted,
				reboot_reason: rebootResult.reason,
			},
		});
	}
}

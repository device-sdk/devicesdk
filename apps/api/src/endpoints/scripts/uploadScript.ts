import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { triggerDeviceReboot } from "../../foundation/deviceReboot";
import { validateUserScript } from "../../foundation/scriptValidator";
import type {
	AppContext,
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../types";

export class UploadScript extends OpenAPIRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "Upload a new script version for a device",
		operationId: "scripts-upload",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					script: z.string().max(1024 * 1024), // 1MB
					entrypoint: z.string().min(1).max(255),
					message: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"201": {
				description: "Returns the created script version",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							version_id: z.string(),
							device_id: z.string(),
							entrypoint: z.string(),
							message: z.string().nullable(),
							created_at: z.number(),
							device_rebooted: z.boolean(),
							reboot_reason: z.string(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request - script validation failed",
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

		const script = data.body.script;
		const entrypoint = data.body.entrypoint;
		const message = data.body.message || null;

		// Validate the user script before saving
		const validation = await validateUserScript(c.env, script, entrypoint);
		if (!validation.valid) {
			return c.json(
				{
					success: false,
					errors: validation.errors.map((e) => ({ message: e })),
					warnings: validation.warnings,
				},
				400,
			);
		}

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

		const versionId = crypto.randomUUID();
		const r2 = c.env.SCRIPTS;

		// Store the script in R2: /{userId}/{projectId}/{deviceId}/{versionId}.js
		await r2.put(
			`${user.id}/${project.id}/${device.id}/${versionId}.js`,
			script,
		);

		const now = Date.now();

		// Create the script version record
		await qb
			.insert<tableDeviceScripts>({
				tableName: "device_scripts",
				data: {
					id: versionId,
					device_id: device.id,
					version_id: versionId,
					entrypoint: entrypoint,
					message: message,
					created_at: now,
				},
			})
			.execute();

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

		// Trigger device reboot so it loads the new script
		const rebootResult = await triggerDeviceReboot(
			c.env,
			project.id,
			device.id,
		);

		return c.json(
			{
				success: true,
				result: {
					version_id: versionId,
					device_id: deviceId,
					entrypoint: entrypoint,
					message: message,
					created_at: now,
					device_rebooted: rebootResult.rebooted,
					reboot_reason: rebootResult.reason,
				},
				warnings: validation.warnings,
			},
			201,
		);
	}
}

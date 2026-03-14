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

const deviceSlugRegex = /^[a-z][a-z0-9-]{0,35}$/;

export class BatchUploadScripts extends OpenAPIRoute {
	public schema = {
		tags: ["Scripts"],
		summary: "Upload scripts for multiple devices at once",
		operationId: "scripts-batch-upload",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					devices: z.record(
						z.string(),
						z.object({
							script: z.string().max(1024 * 1024),
							entrypoint: z.string().min(1).max(255),
						}),
					),
					message: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"201": {
				description: "Returns the created script versions",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							versions: z.array(
								z.object({
									device_id: z.string(),
									version_id: z.string(),
									status: z.enum(["success", "created"]),
									device_rebooted: z.boolean(),
									reboot_reason: z.string(),
								}),
							),
							message: z.string().nullable(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request - validation failed",
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

		const devicesData = data.body.devices;
		const message = data.body.message || null;

		// Validate device IDs format
		const deviceIds = Object.keys(devicesData);
		for (const deviceId of deviceIds) {
			if (!deviceSlugRegex.test(deviceId)) {
				return c.json(
					{
						success: false,
						error: `Invalid device_id format: ${deviceId}. Must be lowercase alphanumeric with hyphens, starting with a letter.`,
					},
					400,
				);
			}
		}

		// Validate all scripts first before making any changes
		const validationResults: {
			deviceId: string;
			errors: string[];
			warnings: string[];
		}[] = [];
		for (const [deviceId, data] of Object.entries(devicesData)) {
			const validation = await validateUserScript(
				c.env,
				data.script,
				data.entrypoint,
			);
			if (!validation.valid) {
				validationResults.push({
					deviceId,
					errors: validation.errors,
					warnings: validation.warnings,
				});
			}
		}

		if (validationResults.length > 0) {
			return c.json(
				{
					success: false,
					errors: validationResults.map((v) => ({
						device_id: v.deviceId,
						messages: v.errors,
					})),
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

		// Get existing devices for this project
		const existingDevicesResult = await qb
			.fetchAll<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1"],
					params: [project.id],
				},
			})
			.execute();
		const existingDevices = existingDevicesResult.results || [];

		const existingDeviceMap = new Map<string, tableDevices>(
			existingDevices.map((d) => [d.device_slug, d]),
		);

		const r2 = c.env.SCRIPTS;
		const now = Date.now();
		const results: {
			device_id: string;
			version_id: string;
			status: "success" | "created";
			device_rebooted: boolean;
			reboot_reason: string;
		}[] = [];

		// Process each device
		for (const [deviceSlug, data] of Object.entries(devicesData)) {
			let device = existingDeviceMap.get(deviceSlug);
			let status: "success" | "created" = "success";

			// Auto-create device if it doesn't exist
			if (!device) {
				const newDevice = await qb
					.insert<tableDevices>({
						tableName: "devices",
						data: {
							id: crypto.randomUUID(),
							project_id: project.id,
							device_slug: deviceSlug,
							name: null,
							description: null,
							created_at: now,
							updated_at: now,
						},
						returning: "*",
					})
					.execute();

				device = newDevice.results!;
				status = "created";
			}

			const versionId = crypto.randomUUID();

			// Store the script in R2
			await r2.put(
				`${user.id}/${project.id}/${device?.id}/${versionId}.js`,
				data.script,
			);

			// Create the script version record
			await qb
				.insert<tableDeviceScripts>({
					tableName: "device_scripts",
					data: {
						id: versionId,
						device_id: device.id,
						version_id: versionId,
						entrypoint: data.entrypoint,
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

			results.push({
				device_id: deviceSlug,
				version_id: versionId,
				status: status,
				device_rebooted: rebootResult.rebooted,
				reboot_reason: rebootResult.reason,
			});
		}

		return c.json(
			{
				success: true,
				result: {
					versions: results,
					message: message,
				},
			},
			201,
		);
	}
}

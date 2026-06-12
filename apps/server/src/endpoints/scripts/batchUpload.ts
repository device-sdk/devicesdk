import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import {
	JS_IDENTIFIER_REGEX,
	MAX_SCRIPT_SIZE_BYTES,
	RESOURCE_LIMITS,
} from "../../foundation/consts";
import { triggerDeviceReboot } from "../../foundation/deviceReboot";
import { enforceResourceLimit } from "../../foundation/limits";
import { logger } from "../../foundation/logger";
import { pruneOldVersions } from "../../foundation/scriptPruning";
import { validateUserScript } from "../../foundation/scriptValidator";
import type {
	AppContext,
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../types";

const deviceSlugRegex = /^[a-z][a-z0-9-]{0,35}$/;

export class BatchUploadScripts extends BaseRoute {
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
							script: z.string().max(MAX_SCRIPT_SIZE_BYTES),
							entrypoint: z
								.string()
								.min(1)
								.max(255)
								.regex(
									JS_IDENTIFIER_REGEX,
									"Entrypoint must be a valid JavaScript identifier",
								),
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
			let validation: Awaited<ReturnType<typeof validateUserScript>>;
			try {
				validation = await validateUserScript(data.script, data.entrypoint);
			} catch (err) {
				logger.error(err as Error, "Unhandled error");
				return c.json(
					{
						success: false,
						error: "Script validation service unavailable",
					},
					503,
				);
			}
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
					// `error` is the canonical contract field the CLI surfaces to
					// users; `errors` keeps the structured per-device detail.
					error: `Script validation failed for ${validationResults.length} device(s): ${validationResults
						.map((v) => `${v.deviceId} — ${v.errors.join("; ")}`)
						.join(" | ")}`,
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

		// Enforce device count limit — check how many new devices would be created
		const newDeviceCount = deviceIds.filter(
			(id) => !existingDeviceMap.has(id),
		).length;
		if (newDeviceCount > 0) {
			const limitResponse = enforceResourceLimit(
				c,
				existingDevices.length + newDeviceCount,
				RESOURCE_LIMITS.maxDevicesPerProject,
				"devices",
			);
			if (limitResponse) return limitResponse;
		}

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

			// Prune oldest non-current versions if at the limit (FIFO), then insert.
			// FIFO pruning is the enforcement mechanism for script version limits.
			await pruneOldVersions(
				c.env.DB,
				c.env.SCRIPTS,
				device,
				user.id,
				projectId,
				deviceSlug,
				RESOURCE_LIMITS.maxScriptVersionsPerDevice,
			);

			const versionId = crypto.randomUUID();

			// Store the script in R2 using slug-based paths to match the reading
			// endpoints (getScript, getVersion, deployVersion) which use URL slugs.
			// /{userId}/{projectSlug}/{deviceSlug}/{versionId}.js
			try {
				await r2.put(
					`${user.id}/${projectId}/${deviceSlug}/${versionId}.js`,
					data.script,
				);
				// Write latest.js so getScript can return the currently deployed script.
				await r2.put(
					`${user.id}/${projectId}/${deviceSlug}/latest.js`,
					data.script,
				);
			} catch (err) {
				logger.error(err as Error, "Unhandled error");
				return c.json(
					{
						success: false,
						error: `Failed to store script for device ${deviceSlug}`,
					},
					500,
				);
			}

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

import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

// Validation schema mirrors `HaEntityDeclaration` from @devicesdk/core.
// Kept in this file to avoid importing runtime code from a pure-type package.
const HaEntityDeclarationSchema = z.object({
	entity_id: z
		.string()
		.min(1)
		.max(64)
		.regex(
			/^[a-z][a-z0-9_]*$/,
			"entity_id must be lowercase letters, digits, and underscores, starting with a letter",
		),
	type: z.enum(["binary_sensor", "sensor", "switch", "light", "number"]),
	name: z.string().min(1).max(128),
	device_class: z.string().max(64).optional(),
	unit: z.string().max(32).optional(),
	source: z.enum([
		"gpio_state_changed",
		"pin_state_update",
		"temperature_result",
		"user",
	]),
	pin: z.number().int().min(0).max(255).optional(),
	state_map: z
		.object({
			high: z.string().max(32),
			low: z.string().max(32),
		})
		.optional(),
	light_type: z.enum(["pwm", "ws2812"]).optional(),
	pwm_frequency: z.number().int().positive().optional(),
	num_leds: z.number().int().positive().max(1024).optional(),
});

const MAX_ENTITIES_PER_DEVICE = 50;

/**
 * PUT /v1/projects/:projectId/devices/:deviceId/entities
 *
 * Replaces the entity declarations for a device. Called by the CLI on
 * `devicesdk deploy` when the user has `ha.entities` in their `devicesdk.ts`.
 */
export class UpsertDeviceEntities extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Replace HA entity declarations for a device",
		operationId: "devices-upsert-entities",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					entities: z
						.array(HaEntityDeclarationSchema)
						.max(MAX_ENTITIES_PER_DEVICE),
				}),
			),
		},
		responses: {
			"200": {
				description: "Entity declarations stored",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							count: z.number(),
						}),
					}),
				),
			},
			"400": {
				description: "Duplicate entity_id in request",
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
		const { entities } = data.body;

		// Reject duplicate entity_ids in the same request
		const seen = new Set<string>();
		for (const entity of entities) {
			if (seen.has(entity.entity_id)) {
				return c.json(
					{
						success: false,
						error: `Duplicate entity_id "${entity.entity_id}" in request`,
					},
					400,
				);
			}
			seen.add(entity.entity_id);
		}

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

		const now = Date.now();
		const statements = [
			c.env.DB.prepare(
				"DELETE FROM device_entity_configs WHERE device_id = ?",
			).bind(device.id),
			...entities.map((entity) =>
				c.env.DB.prepare(
					`INSERT INTO device_entity_configs
						(id, device_id, entity_id, config, created_at, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?)`,
				).bind(
					crypto.randomUUID(),
					device.id,
					entity.entity_id,
					JSON.stringify(entity),
					now,
					now,
				),
			),
		];

		await c.env.DB.batch(statements);

		return c.json({
			success: true,
			result: { count: entities.length },
		});
	}
}

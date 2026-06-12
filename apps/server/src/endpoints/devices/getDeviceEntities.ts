import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type {
	AppContext,
	tableDeviceEntityConfigs,
	tableDevices,
	tableProjects,
} from "../../types";
import { HaEntityDeclarationSchema } from "./upsertDeviceEntities";

/**
 * GET /v1/projects/:projectId/devices/:deviceId/entities
 *
 * Returns the Home Assistant (or equivalent) entity declarations associated
 * with a device. These are uploaded on `devicesdk deploy` when the user sets
 * `ha.entities` in their `devicesdk.ts` config.
 */
export class GetDeviceEntities extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "List HA entity declarations for a device",
		operationId: "devices-list-entities",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns the entity declarations for this device",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							entities: z.array(z.record(z.string(), z.unknown())),
						}),
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

		const { results: rows } = await qb
			.fetchAll<tableDeviceEntityConfigs>({
				tableName: "device_entity_configs",
				where: {
					conditions: ["device_id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		const entities = (rows ?? []).flatMap((row: tableDeviceEntityConfigs) => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(row.config);
			} catch {
				return [];
			}
			const result = HaEntityDeclarationSchema.safeParse(parsed);
			if (!result.success) {
				return [];
			}
			return [result.data];
		});

		return c.json({
			success: true,
			result: { entities },
		});
	}
}

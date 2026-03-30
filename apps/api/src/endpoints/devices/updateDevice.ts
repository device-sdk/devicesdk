import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class UpdateDevice extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Update a device",
		operationId: "devices-update",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					name: z.string().max(100).optional(),
					description: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Returns the updated device",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							device_id: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							updated_at: z.number(),
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
		const params: { projectId: string; deviceId: string } = data.params;
		const body: { name?: string; description?: string } = data.body;
		const { projectId, deviceId } = params;

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

		const now = Date.now();
		const updateData: Partial<Omit<tableDevices, "name" | "description">> & {
			name?: string | null;
			description?: string | null;
		} = {
			updated_at: now,
		};

		if (body.name !== undefined) {
			updateData.name = body.name || null;
		}
		if (body.description !== undefined) {
			updateData.description = body.description || null;
		}

		await qb
			.update({
				tableName: "devices",
				data: updateData,
				where: {
					conditions: ["id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		return c.json({
			success: true,
			result: {
				id: device.id,
				device_id: device.device_slug,
				name: body.name !== undefined ? body.name || null : device.name,
				description:
					body.description !== undefined
						? body.description || null
						: device.description,
				updated_at: now,
			},
		});
	}
}

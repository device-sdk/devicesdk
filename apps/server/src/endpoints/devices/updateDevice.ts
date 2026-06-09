import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext, tableDevices } from "../../types";

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
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const params: { projectId: string; deviceId: string } = data.params;
		const body: { name?: string; description?: string } = data.body;
		const { projectId, deviceId } = params;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { device } = resolved;

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

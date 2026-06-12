import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext } from "../../types";

export class GetDevice extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Get a single device by ID",
		operationId: "devices-get",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns a single device",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							device_id: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							current_version_id: z.string().nullable(),
							last_connected_at: z.number().nullable(),
							created_at: z.number(),
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { device } = resolved;

		return c.json({
			success: true,
			result: {
				id: device.id,
				device_id: device.device_slug,
				name: device.name || null,
				description: device.description || null,
				current_version_id: device.current_version_id || null,
				last_connected_at: device.last_connected_at || null,
				created_at: device.created_at,
				updated_at: device.updated_at,
			},
		});
	}
}

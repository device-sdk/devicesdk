import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { getDeviceConnectionStatus } from "../../foundation/deviceStatus";
import type { AppContext, tableDevices, tableProjects } from "../../types";

export class GetDeviceStatus extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Get live connection status for a device",
		operationId: "devices-get-status",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns the live connection status of the device",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							connected: z.boolean(),
							connected_since: z.number().nullable(),
							last_connected_at: z.number().nullable(),
							current_version_id: z.string().nullable(),
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

		// Query the Durable Object for live connection state
		const liveStatus = await getDeviceConnectionStatus(
			c.env,
			project.id,
			device.id,
		);

		return c.json({
			success: true,
			result: {
				connected: liveStatus.connected,
				connected_since: liveStatus.connectedSince,
				last_connected_at: device.last_connected_at ?? null,
				current_version_id: device.current_version_id ?? null,
			},
		});
	}
}

import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

/**
 * Generic watcher WebSocket endpoint. Subscribes to real-time status, log,
 * and state events for a device via the Durable Object's Hibernation API —
 * unlike the legacy SSE log stream, watcher sockets do not keep the DO alive
 * between messages, so always-on subscribers (dashboard, Home Assistant, CI)
 * cost nothing in DO duration when the device is idle.
 */
export class WatchDevice extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Subscribe to a device's real-time events via WebSocket",
		operationId: "devices-watch",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"101": {
				description: "Upgrades connection to a WebSocket",
			},
			"404": {
				description: "Project or device not found",
			},
			"426": {
				description: "Upgrade required - WebSocket upgrade header expected",
			},
		},
	};

	public async handle(c: AppContext) {
		const upgradeHeader = c.req.header("Upgrade");
		if (upgradeHeader !== "websocket") {
			return c.json(
				{ success: false, error: "Expected Upgrade: websocket" },
				426,
			);
		}

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

		const doName = `${project.id}:${device.id}`;
		const durableObjectId = c.env.DEVICE.idFromName(doName);
		const durableObjectStub = c.env.DEVICE.get(durableObjectId);

		// Rewrite the path so the DO's fetch handler dispatches to handleWatcherUpgrade
		const url = new URL(c.req.url);
		url.pathname = "/watch-websocket";

		const doRequest = new Request(url.toString(), {
			method: c.req.method,
			headers: c.req.raw.headers,
		});

		return durableObjectStub.fetch(doRequest);
	}
}

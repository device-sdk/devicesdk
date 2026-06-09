import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext } from "../../types";

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

		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { project, device } = resolved;

		// Phase 2 wires this to the in-process device runtime
		// (DeviceHub.attachWatcher upgrades the socket on the live session).
		void project;
		void device;
		return c.json(
			{ success: false, error: "Device runtime not available yet" },
			501,
		);
	}
}

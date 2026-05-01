import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

/**
 * GET /v1/projects/:projectId/devices/:deviceId/logs
 *
 * **Deprecated** as of May 2026 — always returns 410 Gone with a `Link` header
 * pointing at the watcher WebSocket. The polling pattern this endpoint enabled
 * burned the daily DO rows-read quota; see the comment block on
 * `BaseDevice.getLogs` in `durableObjects/lib/device.ts` for the full incident
 * write-up.
 *
 * Migrated callers (dashboard logs panel, CLI `logs`/`logs --tail`) connect to
 * `/v1/projects/:projectId/devices/:deviceId/watch?backfillLimit=N` instead and
 * receive history + live events on a single hibernating WebSocket.
 *
 * The 404 path for missing project/device is preserved so consumers can still
 * distinguish "wrong URL" from "endpoint deprecated."
 */
export class ListLogs extends BaseRoute {
	public schema = {
		tags: ["Logs"],
		summary: "Deprecated — use the watcher WebSocket",
		operationId: "logs-list",
		deprecated: true,
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			query: z.object({
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).optional(),
				level: z.enum(["log", "info", "warn", "error", "debug"]).optional(),
			}),
		},
		responses: {
			"404": {
				description: "Project or device not found",
			},
			"410": {
				description: "Endpoint deprecated — use the watcher WebSocket",
				...contentJson(
					z.object({
						success: z.literal(false),
						error: z.string(),
						code: z.literal("LOGS_DEPRECATED"),
					}),
				),
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

		const watchPath = `/v1/projects/${projectId}/devices/${deviceId}/watch`;
		return c.json(
			{
				success: false,
				error: `Endpoint deprecated. Use the watcher WebSocket at ${watchPath}?backfillLimit=N`,
				code: "LOGS_DEPRECATED",
			},
			410,
			{ Link: `<${watchPath}>; rel="alternate"` },
		);
	}
}

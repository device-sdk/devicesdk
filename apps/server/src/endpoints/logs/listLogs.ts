import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext } from "../../types";

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
 * No D1 lookups are performed: the entire point of this fix is to avoid
 * spending row-reads on a route that exists only to point clients at the
 * replacement. The `Link` header lets a stale client follow the migration on
 * its own; the rate limiter mounted on this path bounds the burn from any
 * client that ignores the 410.
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;

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

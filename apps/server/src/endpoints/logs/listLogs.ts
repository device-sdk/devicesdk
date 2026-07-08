import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext } from "../../types";

const DEFAULT_LIMIT = 50;

interface LogRow {
	id: string;
	level: string;
	message: string;
	created_at: number;
}

function encodeCursor(createdAt: number, id: string): string {
	return `${createdAt}:${id}`;
}

function decodeCursor(raw: string): { createdAt: number; id: string } | null {
	const idx = raw.indexOf(":");
	if (idx < 1) return null;
	const createdAt = Number(raw.slice(0, idx));
	const id = raw.slice(idx + 1);
	if (!Number.isFinite(createdAt) || !id) return null;
	return { createdAt, id };
}

/**
 * GET /v1/projects/:projectId/devices/:deviceId/logs
 *
 * Point-in-time page of persisted device logs (the `device_logs` table),
 * newest first. This was a 410 in the Cloudflare era because each read burned
 * the Durable Object's daily rows-read quota; now that the server owns its
 * own SQLite storage there is no quota to protect, so plain paging is cheap.
 * Complements rather than replaces the watcher WebSocket
 * (`/watch?backfillLimit=N`): this is a stateless polling/paging API for
 * scripts, cron jobs, and MCP tools that don't want to hold a socket open.
 */
export class ListLogs extends BaseRoute {
	public schema = {
		tags: ["Logs"],
		summary: "List persisted device logs",
		operationId: "logs-list",
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
			"200": {
				description: "Page of device logs, newest first",
				...contentJson(
					z.object({
						success: z.literal(true),
						result: z.object({
							logs: z.array(
								z.object({
									id: z.string(),
									level: z.string(),
									message: z.string(),
									created_at: z.number(),
								}),
							),
							cursor: z
								.string()
								.nullable()
								.describe("Pass as ?cursor= to fetch the next (older) page"),
						}),
					}),
				),
			},
			"400": {
				description: "Invalid cursor",
			},
			"404": {
				description: "Project or device not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		const { cursor, limit, level } = data.query;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { device } = resolved;

		let before: { createdAt: number; id: string } | null = null;
		if (cursor !== undefined) {
			before = decodeCursor(cursor);
			if (!before) {
				return c.json({ success: false, error: "Invalid cursor" }, 400);
			}
		}

		const pageSize = limit ?? DEFAULT_LIMIT;
		const conditions = ["device_id = ?1"];
		const params: (string | number)[] = [device.id];
		let idx = 2;
		if (level) {
			conditions.push(`level = ?${idx}`);
			params.push(level);
			idx++;
		}
		if (before) {
			conditions.push(
				`(created_at < ?${idx} OR (created_at = ?${idx} AND id < ?${idx + 1}))`,
			);
			params.push(before.createdAt, before.id);
			idx += 2;
		}
		params.push(pageSize);

		const rows = c
			.get("qb")
			.db.query(
				`SELECT id, level, message, created_at FROM device_logs
				 WHERE ${conditions.join(" AND ")}
				 ORDER BY created_at DESC, id DESC LIMIT ?${idx}`,
			)
			.all(...params) as LogRow[];

		const last = rows[rows.length - 1];
		const nextCursor =
			rows.length === pageSize && last
				? encodeCursor(last.created_at, last.id)
				: null;

		return c.json({
			success: true,
			result: { logs: rows, cursor: nextCursor },
		});
	}
}

import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { logger } from "../../foundation/logger";
import type { AppContext, tableProjects } from "../../types";

export class DeleteProject extends BaseRoute {
	public schema = {
		tags: ["Projects"],
		summary: "Delete a project and all its devices",
		operationId: "projects-delete",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Project deleted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
							project_slug: z.string(),
						}),
					}),
				),
			},
			"404": {
				description: "Project not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;

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

		// device_kv/device_logs/device_usage have no FK to devices (and
		// project deletion cascades to devices) - delete explicitly so a
		// deleted project leaves no KV/log/usage orphans behind.
		await c.env.DB.prepare(
			"DELETE FROM device_kv WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)",
		)
			.bind(project.id)
			.run();
		await c.env.DB.prepare(
			"DELETE FROM device_logs WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)",
		)
			.bind(project.id)
			.run();
		await c.env.DB.prepare("DELETE FROM device_usage WHERE project_id = ?")
			.bind(project.id)
			.run();

		// Delete the project (cascades to devices and device_scripts via FK)
		await qb
			.delete({
				tableName: "projects",
				where: {
					conditions: ["id = ?1"],
					params: [project.id],
				},
			})
			.execute();

		// Best-effort blob cleanup - DB delete already committed. list() pages
		// at 1000 keys, so follow the cursor until every page is drained (a
		// project at its device/version limits holds ~2100 blobs).
		try {
			const r2 = c.env.SCRIPTS;
			const prefix = `${user.id}/${projectId}/`;
			let cursor: string | undefined;
			do {
				const listed = await r2.list({ prefix, cursor });
				for (const obj of listed.objects) {
					await r2.delete(obj.key);
				}
				cursor = listed.truncated ? listed.cursor : undefined;
			} while (cursor);
		} catch (err) {
			logger.error(err as Error, "Unhandled error");
		}

		return c.json({
			success: true,
			result: {
				deleted: true,
				project_slug: projectId,
			},
		});
	}
}

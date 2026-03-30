import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
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

		// Also delete all scripts from R2 for this project
		const r2 = c.env.SCRIPTS;
		const prefix = `${user.id}/${projectId}/`;
		const objects = await r2.list({ prefix });
		for (const obj of objects.objects) {
			await r2.delete(obj.key);
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

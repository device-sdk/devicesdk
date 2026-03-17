import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type {
	AppContext,
	tableProjectEnvVars,
	tableProjects,
} from "../../types";

export class DeleteEnvVar extends OpenAPIRoute {
	public schema = {
		tags: ["Env Vars"],
		summary: "Delete a single environment variable",
		operationId: "env-vars-delete",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				key: z.string().min(1).max(64),
			}),
		},
		responses: {
			"200": {
				description: "Env var deleted",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
							key: z.string(),
						}),
					}),
				),
			},
			"404": {
				description: "Project or env var not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, key } = data.params;

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

		const existing = await qb
			.fetchOne<tableProjectEnvVars>({
				tableName: "project_env_vars",
				where: {
					conditions: ["project_id = ?1", "key = ?2"],
					params: [project.id, key],
				},
			})
			.execute()
			.then((r) => r.results);

		if (!existing) {
			return c.json({ success: false, error: "Env var not found" }, 404);
		}

		await qb
			.delete({
				tableName: "project_env_vars",
				where: {
					conditions: ["project_id = ?1", "key = ?2"],
					params: [project.id, key],
				},
			})
			.execute();

		return c.json({
			success: true,
			result: { deleted: true, key },
		});
	}
}

import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
import type {
	AppContext,
	tableProjectEnvVars,
	tableProjects,
} from "../../types";

export class ListEnvVars extends BaseRoute {
	public schema = {
		tags: ["Env Vars"],
		summary: "List environment variable keys for a project",
		operationId: "env-vars-list",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
		},
		responses: {
			"200": {
				description: "Returns list of env var keys (values are never returned)",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							vars: z.array(
								z.object({
									key: z.string(),
									updated_at: z.number(),
								}),
							),
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

		const { results: rows } = await qb
			.fetchAll<tableProjectEnvVars>({
				tableName: "project_env_vars",
				fields: ["key", "updated_at"],
				where: {
					conditions: ["project_id = ?1"],
					params: [project.id],
				},
			})
			.execute();

		return c.json({
			success: true,
			result: {
				vars: (rows ?? []).map((r: tableProjectEnvVars) => ({
					key: r.key,
					updated_at: r.updated_at,
				})),
			},
		});
	}
}

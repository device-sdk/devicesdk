import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext, tableProjects } from "../../types";
import { ApiException } from "chanfana";

export class ListProjects extends OpenAPIRoute {
	public schema = {
		tags: ["Projects"],
		summary: "List all projects",
		operationId: "projects-list",
		responses: {
			"200": {
				description: "Returns a list of projects",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
							z.object({
								id: z.string(),
								project_slug: z.string(),
								created_at: z.number(),
							}),
						),
					}),
				),
			},
			"400": {
				description: "Bad request",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");

		const { results: projects } = await qb
			.fetchAll<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["user_id = ?1"],
					params: [user.id],
				},
				orderBy: "project_slug ASC",
				limit: 100,
			})
			.execute();

		if (!projects) {
			return c.json({ success: true, result: [] }, 200);
		}

		return c.json(
			{
				success: true,
				result: projects.map((p: tableProjects) => ({
					id: p.id,
					project_slug: p.project_slug,
					created_at: p.created_at,
				})),
			},
			200,
		);
	}
}

import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableProjects } from "../../types";

export class ListProjects extends BaseRoute {
	public schema = {
		tags: ["Projects"],
		summary: "List all projects",
		operationId: "projects-list",
		request: {
			query: z.object({
				page: z.coerce.number().int().min(1).default(1),
				per_page: z.coerce.number().int().min(1).max(100).default(50),
			}),
		},
		responses: {
			"200": {
				description: "Returns a paginated list of projects",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							items: z.array(
								z.object({
									id: z.string(),
									project_slug: z.string(),
									created_at: z.number(),
								}),
							),
							page: z.number().int(),
							per_page: z.number().int(),
							has_more: z.boolean(),
						}),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { page, per_page } = data.query;

		const { results: projects } = await qb
			.fetchAll<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["user_id = ?1"],
					params: [user.id],
				},
				orderBy: "created_at DESC",
				limit: per_page + 1,
				offset: (page - 1) * per_page,
			})
			.execute();

		if (!projects) {
			return c.json(
				{
					success: true,
					result: { items: [], page, per_page, has_more: false },
				},
				200,
			);
		}

		const has_more = projects.length > per_page;
		if (has_more) projects.pop();

		return c.json(
			{
				success: true,
				result: {
					items: projects.map((p: tableProjects) => ({
						id: p.id,
						project_slug: p.project_slug,
						created_at: p.created_at,
					})),
					page,
					per_page,
					has_more,
				},
			},
			200,
		);
	}
}

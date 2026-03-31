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
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).default(50),
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
							next_cursor: z.string().nullable(),
						}),
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { cursor, limit } = data.query;

		const conditions: string[] = ["user_id = ?1"];
		const params: (string | number)[] = [user.id];

		if (cursor) {
			const decodedCursor = Number(atob(cursor));
			if (Number.isNaN(decodedCursor)) {
				return c.json({ success: false, error: "Invalid cursor" }, 400);
			}
			conditions.push(`created_at < ?${params.length + 1}`);
			params.push(decodedCursor);
		}

		const { results: projects } = await qb
			.fetchAll<tableProjects>({
				tableName: "projects",
				where: {
					conditions,
					params,
				},
				orderBy: "created_at DESC",
				limit: limit + 1,
			})
			.execute();

		if (!projects) {
			return c.json(
				{ success: true, result: { items: [], next_cursor: null } },
				200,
			);
		}

		let nextCursor: string | null = null;
		if (projects.length > limit) {
			projects.pop();
			const lastItem = projects[projects.length - 1];
			nextCursor = btoa(String(lastItem.created_at));
		}

		return c.json(
			{
				success: true,
				result: {
					items: projects.map((p: tableProjects) => ({
						id: p.id,
						project_slug: p.project_slug,
						created_at: p.created_at,
					})),
					next_cursor: nextCursor,
				},
			},
			200,
		);
	}
}

import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableTokens } from "../../types";

export class ListApiTokens extends BaseRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "List all API tokens",
		operationId: "tokens-list",
		request: {
			query: z.object({
				page: z.coerce.number().int().min(1).default(1),
				per_page: z.coerce.number().int().min(1).max(100).default(50),
			}),
		},
		responses: {
			"200": {
				description:
					"Returns a paginated list of API tokens (excluding the token value for security)",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							items: z.array(
								z.object({
									id: z.string(),
									created_at: z.number(),
									last_four: z.string(),
									description: z.string().nullable().optional(),
									managed: z.boolean().optional(),
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

		const { results: tokens } = await qb
			.fetchAll<tableTokens>({
				tableName: "tokens",
				fields: [
					"id",
					"created_at",
					"token",
					"last_four",
					"description",
					"managed",
				],
				where: {
					conditions: ["user_id = ?1"],
					params: [user.id],
				},
				orderBy: "created_at DESC",
				limit: per_page + 1,
				offset: (page - 1) * per_page,
			})
			.execute();

		if (!tokens) {
			return c.json(
				{
					success: true,
					result: { items: [], page, per_page, has_more: false },
				},
				200,
			);
		}

		const has_more = tokens.length > per_page;
		if (has_more) tokens.pop();

		return c.json(
			{
				success: true,
				result: {
					items: tokens.map((t: tableTokens) => ({
						id: t.id,
						created_at: t.created_at,
						last_four: t.last_four ?? (t.token ? t.token.slice(-4) : "????"),
						description: t.description ?? null,
						managed: t.managed === 1,
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

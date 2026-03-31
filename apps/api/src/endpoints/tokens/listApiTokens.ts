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
				cursor: z.string().optional(),
				limit: z.coerce.number().min(1).max(100).default(50),
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
							next_cursor: z.string().nullable(),
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
					conditions,
					params,
				},
				orderBy: "created_at DESC",
				limit: limit + 1,
			})
			.execute();

		if (!tokens) {
			return c.json(
				{ success: true, result: { items: [], next_cursor: null } },
				200,
			);
		}

		let nextCursor: string | null = null;
		if (tokens.length > limit) {
			tokens.pop();
			const lastItem = tokens[tokens.length - 1];
			nextCursor = btoa(String(lastItem.created_at));
		}

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
					next_cursor: nextCursor,
				},
			},
			200,
		);
	}
}

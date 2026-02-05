import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext, tableTokens } from "../../types";
import { ApiException } from "chanfana";

export class ListApiTokens extends OpenAPIRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "List all API tokens",
		operationId: "tokens-list",
		responses: {
			"200": {
				description:
					"Returns a list of API tokens (excluding the token value for security)",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
							z.object({
								id: z.string(),
								created_at: z.number(),
								last_four: z.string(),
								description: z.string().nullable().optional(),
								managed: z.boolean().optional(),
							}),
						),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");

		const { results: tokens } = await qb
			.fetchAll<tableTokens>({
				tableName: "tokens",
				fields: ["id", "created_at", "token", "description", "managed"],
				where: {
					conditions: ["user_id = ?1"],
					params: [user.id],
				},
				orderBy: "created_at DESC",
				limit: 100,
			})
			.execute();

		if (!tokens) {
			return c.json({ success: true, result: [] }, 200);
		}

		return c.json(
			{
				success: true,
				result: tokens.map((t: tableTokens) => ({
					id: t.id,
					created_at: t.created_at,
					last_four: t.token.slice(-4),
					description: t.description ?? null,
					managed: t.managed === 1,
				})),
			},
			200,
		);
	}
}

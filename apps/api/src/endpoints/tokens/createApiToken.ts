import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import type { AppContext, tableTokens } from "../../types";
import { ApiException } from "chanfana";

export class CreateApiToken extends OpenAPIRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "Create a new API token",
		operationId: "tokens-create",
		responses: {
			"201": {
				description: "Returns the new API token",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							token: z.string(),
							created_at: z.number(),
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

		const { results: countResult } = await qb
			.fetchOne<{ count: number }>({
				tableName: "tokens",
				fields: "COUNT(*) as count",
				where: {
					conditions: ["user_id = ?1"],
					params: [user.id],
				},
			})
			.execute();

		if (countResult && countResult.count >= 50) {
			throw new ApiException("Maximum number of API tokens reached");
		}

		const newApiToken = await qb
			.insert<tableTokens>({
				tableName: "tokens",
				data: {
					id: crypto.randomUUID(),
					user_id: user.id,
					token: crypto.randomUUID().replaceAll("-", ""),
					created_at: Date.now(),
				},
				returning: ["id", "token", "created_at"],
			})
			.execute()
			.then((t) => t.results);

		if (!newApiToken) {
			throw new ApiException("Failed to create API token in database");
		}

		return c.json(
			{
				success: true,
				result: newApiToken,
			},
			201,
		);
	}
}

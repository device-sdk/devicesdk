import { ApiException, contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { hashToken } from "../../foundation/tokenHash";
import type { AppContext, tableTokens } from "../../types";

export class CreateApiToken extends OpenAPIRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "Create a new API token",
		operationId: "tokens-create",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							description: z.string().max(100).optional(),
						}),
					},
				},
				required: false,
			},
		},
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
							description: z.string().nullable().optional(),
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
		const description = data.body?.description;

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

		const rawToken = crypto.randomUUID().replaceAll("-", "");
		const tokenHash = await hashToken(rawToken);
		const lastFour = rawToken.slice(-4);

		const newApiToken = await qb
			.insert<tableTokens>({
				tableName: "tokens",
				data: {
					id: crypto.randomUUID(),
					user_id: user.id,
					token: "",
					token_hash: tokenHash,
					last_four: lastFour,
					created_at: Date.now(),
					...(description ? { description } : {}),
				},
				returning: ["id", "created_at", "description"],
			})
			.execute()
			.then((t) => t.results);

		if (!newApiToken) {
			throw new ApiException("Failed to create API token in database");
		}

		return c.json(
			{
				success: true,
				result: {
					...newApiToken,
					token: rawToken,
				},
			},
			201,
		);
	}
}

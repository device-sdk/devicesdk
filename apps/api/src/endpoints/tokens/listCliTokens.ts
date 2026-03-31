import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext } from "../../types";

export class ListCliTokens extends BaseRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "List CLI tokens for the authenticated user",
		operationId: "tokens-cli-list",
		responses: {
			"200": {
				description:
					"Returns a list of CLI tokens (excluding hashes for security)",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
							z.object({
								id: z.string(),
								created_at: z.number(),
								expires_at: z.number(),
								last_used_at: z.number().nullable(),
							}),
						),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");

		const { results } = await c.env.DB.prepare(
			"SELECT id, created_at, expires_at, last_used_at FROM cli_tokens WHERE user_id = ? ORDER BY created_at DESC",
		)
			.bind(user.id)
			.all<{
				id: string;
				created_at: number;
				expires_at: number;
				last_used_at: number | null;
			}>();

		return c.json(
			{
				success: true,
				result: results.map((t) => ({
					id: t.id,
					created_at: t.created_at,
					expires_at: t.expires_at,
					last_used_at: t.last_used_at ?? null,
				})),
			},
			200,
		);
	}
}

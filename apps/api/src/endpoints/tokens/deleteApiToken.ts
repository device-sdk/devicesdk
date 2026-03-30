import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
import type { AppContext, tableTokens } from "../../types";

export class DeleteApiToken extends BaseRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "Delete an API token",
		operationId: "tokens-delete",
		request: {
			params: z.object({
				tokenId: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "Token deleted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
					}),
				),
			},
			"404": {
				description: "Token not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { tokenId } = data.params;

		const token = await qb
			.fetchOne<tableTokens>({
				tableName: "tokens",
				where: {
					conditions: ["user_id = ?1", "id = ?2"],
					params: [user.id, tokenId],
				},
			})
			.execute()
			.then((t) => t.results);

		if (!token) {
			return c.json({ success: false, error: "Token not found" }, 404);
		}

		await qb
			.delete({
				tableName: "tokens",
				where: {
					conditions: ["id = ?1"],
					params: [token.id],
				},
			})
			.execute();

		return c.json({ success: true }, 200);
	}
}

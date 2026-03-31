import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext } from "../../types";

export class DeleteCliToken extends BaseRoute {
	public schema = {
		tags: ["Tokens"],
		summary: "Revoke a CLI token",
		operationId: "tokens-cli-delete",
		request: {
			params: z.object({
				tokenId: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "CLI token revoked successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
						}),
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { tokenId } = data.params;

		const token = await c.env.DB.prepare(
			"SELECT id FROM cli_tokens WHERE id = ? AND user_id = ?",
		)
			.bind(tokenId, user.id)
			.first<{ id: string }>();

		if (!token) {
			return c.json({ success: false, error: "Token not found" }, 404);
		}

		await c.env.DB.prepare("DELETE FROM cli_tokens WHERE id = ?")
			.bind(token.id)
			.run();

		return c.json({ success: true, result: { deleted: true } }, 200);
	}
}

import { hashToken } from "../../foundation/tokenHash";
import type { AppContext } from "../../types";

export async function revokeToken(c: AppContext) {
	const user = c.get("user");
	const body = await c.req.json<{ refresh_token?: string }>();
	const { refresh_token } = body;

	if (refresh_token) {
		const secret = c.env.config.apiTokenSecret;
		const tokenHash = await hashToken(refresh_token, secret);
		await c.env.DB.prepare(
			"DELETE FROM cli_tokens WHERE refresh_token_hash = ? AND user_id = ?",
		)
			.bind(tokenHash, user.id)
			.run();
	}

	return c.json({
		success: true,
		result: {
			revoked: true,
		},
	});
}

import type { AppContext } from "../../types";
import { hashToken } from "./utils";

export async function revokeToken(c: AppContext) {
	const body = await c.req.json<{ refresh_token?: string }>();
	const { refresh_token } = body;

	if (refresh_token) {
		const tokenHash = await hashToken(refresh_token);
		await c.env.DB.prepare(
			"DELETE FROM cli_tokens WHERE refresh_token_hash = ?",
		)
			.bind(tokenHash)
			.run();
	}

	return c.json({
		success: true,
		result: {
			revoked: true,
		},
	});
}

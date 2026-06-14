import { hashToken, legacyHashToken } from "../../foundation/tokenHash";
import type { AppContext } from "../../types";

export async function revokeToken(c: AppContext) {
	const body = await c.req.json<{ refresh_token?: string }>();
	const { refresh_token } = body;

	if (refresh_token) {
		const secret = c.env.config.apiTokenSecret;
		const tokenHashes = [
			await hashToken(refresh_token, secret),
			await legacyHashToken(refresh_token),
		];
		await c.env.DB.prepare(
			"DELETE FROM cli_tokens WHERE refresh_token_hash IN (?, ?)",
		)
			.bind(tokenHashes[0], tokenHashes[1])
			.run();
	}

	return c.json({
		success: true,
		result: {
			revoked: true,
		},
	});
}

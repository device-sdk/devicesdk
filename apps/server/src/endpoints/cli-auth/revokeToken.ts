import { z } from "zod";
import { hashToken } from "../../foundation/tokenHash";
import type { AppContext } from "../../types";

const RevokeSchema = z.object({
	refresh_token: z.string().min(1).max(200),
});

export async function revokeToken(c: AppContext) {
	const user = c.get("user");
	const body = RevokeSchema.safeParse(await c.req.json().catch(() => null));
	if (!body.success) {
		return c.json({ success: false, error: "Invalid request body." }, 400);
	}

	const secret = c.env.config.apiTokenSecret;
	const tokenHash = await hashToken(body.data.refresh_token, secret);
	const result = await c.env.DB.prepare(
		"DELETE FROM cli_tokens WHERE refresh_token_hash = ? AND user_id = ?",
	)
		.bind(tokenHash, user.id)
		.run();

	return c.json({
		success: true,
		result: {
			revoked: result.meta.changes > 0,
		},
	});
}

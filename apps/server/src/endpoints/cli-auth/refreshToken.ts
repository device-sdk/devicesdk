import { hashToken, legacyHashToken } from "../../foundation/tokenHash";
import type { AppContext } from "../../types";
import { generateAccessToken, generateRefreshToken } from "./utils";

type CliToken = {
	id: string;
	user_id: string;
	access_token_hash: string;
	refresh_token_hash: string;
	created_at: number;
	expires_at: number;
	last_used_at: number | null;
};

export async function refreshToken(c: AppContext) {
	const body = await c.req.json<{ refresh_token?: string }>();
	const { refresh_token } = body;

	if (!refresh_token) {
		return c.json({ success: false, error: "missing_refresh_token" }, 400);
	}

	const secret = c.env.config.apiTokenSecret;
	const tokenHashes = [
		await hashToken(refresh_token, secret),
		await legacyHashToken(refresh_token),
	];

	const cliToken = await c.env.DB.prepare(
		"SELECT * FROM cli_tokens WHERE refresh_token_hash IN (?, ?) AND expires_at > ?",
	)
		.bind(tokenHashes[0], tokenHashes[1], Date.now())
		.first<CliToken>();

	if (!cliToken) {
		return c.json({ success: false, error: "invalid_refresh_token" }, 401);
	}

	const newAccessToken = generateAccessToken();
	const newRefreshToken = generateRefreshToken();
	const expiresIn = 86400; // 24 hours
	const refreshExpiresIn = 30 * 24 * 60 * 60; // 30 days
	const currentMs = Date.now();

	await c.env.DB.batch([
		c.env.DB.prepare("DELETE FROM cli_tokens WHERE id = ?").bind(cliToken.id),
		c.env.DB.prepare(
			`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		).bind(
			crypto.randomUUID(),
			cliToken.user_id,
			await hashToken(newAccessToken, secret),
			await hashToken(newRefreshToken, secret),
			currentMs,
			currentMs + refreshExpiresIn * 1000,
		),
	]);

	return c.json({
		success: true,
		result: {
			access_token: newAccessToken,
			refresh_token: newRefreshToken,
			expires_in: expiresIn,
			token_type: "Bearer",
		},
	});
}

import type { AppContext } from "../../types";
import { hashToken, generateAccessToken, generateRefreshToken } from "./utils";

type CliAuthCode = {
	id: string;
	device_code: string;
	user_code: string;
	user_id: string | null;
	status: string;
	created_at: number;
	expires_at: number;
};

type User = {
	id: string;
	email: string;
	name: string;
};

export async function pollAuth(c: AppContext) {
	const body = await c.req.json<{ device_code?: string }>();
	const { device_code } = body;

	if (!device_code) {
		return c.json({ success: false, error: "missing_device_code" }, 400);
	}

	const authCode = await c.env.DB.prepare(
		"SELECT * FROM cli_auth_codes WHERE device_code = ?",
	)
		.bind(device_code)
		.first<CliAuthCode>();

	if (!authCode) {
		return c.json({ success: false, error: "invalid_device_code" }, 400);
	}

	if (authCode.expires_at < Date.now()) {
		await c.env.DB.prepare("DELETE FROM cli_auth_codes WHERE id = ?")
			.bind(authCode.id)
			.run();
		return c.json({ success: false, error: "authorization_expired" }, 400);
	}

	if (authCode.status === "pending") {
		return c.json({ success: true, result: { status: "pending" } });
	}

	if (authCode.status === "denied") {
		await c.env.DB.prepare("DELETE FROM cli_auth_codes WHERE id = ?")
			.bind(authCode.id)
			.run();
		return c.json({ success: true, result: { status: "denied" } });
	}

	if (authCode.status === "approved" && authCode.user_id) {
		const accessToken = generateAccessToken();
		const refreshToken = generateRefreshToken();
		const expiresIn = 86400; // 24 hours
		const refreshExpiresIn = 30 * 24 * 60 * 60; // 30 days
		const currentMs = Date.now();

		await c.env.DB.prepare(
			`INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				crypto.randomUUID(),
				authCode.user_id,
				await hashToken(accessToken),
				await hashToken(refreshToken),
				currentMs,
				currentMs + refreshExpiresIn * 1000,
			)
			.run();

		const user = await c.env.DB.prepare(
			"SELECT id, email, name FROM user WHERE id = ?",
		)
			.bind(authCode.user_id)
			.first<User>();

		await c.env.DB.prepare("DELETE FROM cli_auth_codes WHERE id = ?")
			.bind(authCode.id)
			.run();

		return c.json({
			success: true,
			result: {
				status: "approved",
				access_token: accessToken,
				refresh_token: refreshToken,
				expires_in: expiresIn,
				token_type: "Bearer",
				user: user
					? {
							id: user.id,
							email: user.email,
							name: user.name,
						}
					: null,
			},
		});
	}

	return c.json({ success: true, result: { status: "pending" } });
}

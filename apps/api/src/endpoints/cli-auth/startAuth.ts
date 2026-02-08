import type { AppContext } from "../../types";

function generateUserCode(): string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I, O to avoid confusion
	const letterPart = Array(4)
		.fill(0)
		.map(() => letters[Math.floor(Math.random() * letters.length)])
		.join("");
	const numberPart = Array(4)
		.fill(0)
		.map(() => Math.floor(Math.random() * 10))
		.join("");
	return `${letterPart}-${numberPart}`;
}

function generateDeviceCode(): string {
	const hex = Array(32)
		.fill(0)
		.map(() => Math.floor(Math.random() * 16).toString(16))
		.join("");
	return `DSDK_DEVICE_${hex}`;
}

export async function startAuth(c: AppContext) {
	const deviceCode = generateDeviceCode();
	const userCode = generateUserCode();
	const currentMs = Date.now();
	const expiresAt = currentMs + 15 * 60 * 1000; // 15 minutes

	await c.env.DB.prepare(
		`INSERT INTO cli_auth_codes (id, device_code, user_code, status, created_at, expires_at)
		 VALUES (?, ?, ?, 'pending', ?, ?)`,
	)
		.bind(crypto.randomUUID(), deviceCode, userCode, currentMs, expiresAt)
		.run();

	const baseUrl =
		c.env.ENV === "local"
			? "http://localhost:8787"
			: `${new URL(c.req.url).protocol}//${new URL(c.req.url).host}`;

	return c.json({
		success: true,
		result: {
			device_code: deviceCode,
			user_code: userCode,
			verification_url: `${baseUrl}/cli/auth`,
			verification_url_complete: `${baseUrl}/cli/auth?code=${userCode}`,
			expires_in: 900,
			interval: 5,
		},
	});
}

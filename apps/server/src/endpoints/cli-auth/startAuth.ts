import type { AppContext } from "../../types";

function generateUserCode(): string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I, O to avoid confusion
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	const letterPart = Array.from(bytes.slice(0, 4))
		.map((b) => letters[b % letters.length])
		.join("");
	const numberPart = Array.from(bytes.slice(4, 8))
		.map((b) => b % 10)
		.join("");
	return `${letterPart}-${numberPart}`;
}

function generateDeviceCode(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
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

	// Approval page is served by this same server — derive the URL from the
	// request so it works for any self-hosted host:port.
	const requestUrl = new URL(c.req.url);
	const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

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

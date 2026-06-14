async function sha256Hex(token: string): Promise<string> {
	const utf8 = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Hash a token with HMAC-SHA-256 using the server-side secret.
 * This replaces the previous unsalted SHA-256 storage and prevents
 * rainbow-table / precomputation attacks against predictable tokens.
 */
export async function hashToken(
	token: string,
	secret: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Legacy unsalted SHA-256 hash. Kept only for verifying tokens that were
 * stored before the HMAC migration; new tokens are always written with
 * {@link hashToken}.
 */
export async function legacyHashToken(token: string): Promise<string> {
	return sha256Hex(token);
}

/**
 * Verify a raw token against a stored hash. Uses HMAC first, then falls back
 * to the legacy SHA-256 format for tokens created before this change.
 */
export async function verifyToken(
	token: string,
	storedHash: string,
	secret: string,
): Promise<boolean> {
	const hmac = await hashToken(token, secret);
	if (constantTimeHexEquals(hmac, storedHash)) return true;

	const legacy = await legacyHashToken(token);
	return constantTimeHexEquals(legacy, storedHash);
}

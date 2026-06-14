async function sha256Hex(token: string): Promise<string> {
	const utf8 = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

export async function hashToken(token: string): Promise<string> {
	const utf8 = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((bytes) => bytes.toString(16).padStart(2, "0")).join("");
}

export function generateAccessToken(): string {
	const hex = Array(32)
		.fill(0)
		.map(() => Math.floor(Math.random() * 16).toString(16))
		.join("");
	return `dsdk_${hex}`;
}

export function generateRefreshToken(): string {
	const hex = Array(32)
		.fill(0)
		.map(() => Math.floor(Math.random() * 16).toString(16))
		.join("");
	return `dsdk_refresh_${hex}`;
}

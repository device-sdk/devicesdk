export async function hashToken(token: string): Promise<string> {
	const utf8 = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

import { describe, expect, test } from "bun:test";
import { hashToken, legacyHashToken } from "../../src/foundation/tokenHash";

describe("tokenHash", () => {
	const secret = "test-secret";

	test("HMAC hash is deterministic for the same secret and token", async () => {
		const token = "dsdk_abc123";
		const a = await hashToken(token, secret);
		const b = await hashToken(token, secret);
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	test("HMAC hash differs across secrets", async () => {
		const token = "dsdk_abc123";
		const a = await hashToken(token, secret);
		const b = await hashToken(token, "different-secret");
		expect(a).not.toBe(b);
	});

	test("HMAC hash differs for different tokens with the same secret", async () => {
		const a = await hashToken("dsdk_token_a", secret);
		const b = await hashToken("dsdk_token_b", secret);
		expect(a).not.toBe(b);
	});

	test("legacy hash matches unsalted SHA-256", async () => {
		const token = "dsdk_legacy_token";
		const legacy = await legacyHashToken(token);
		const expected = await crypto.subtle
			.digest("SHA-256", new TextEncoder().encode(token))
			.then((buf) =>
				Array.from(new Uint8Array(buf))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join(""),
			);
		expect(legacy).toBe(expected);
	});

	test("legacy hash differs from HMAC hash of the same token", async () => {
		const token = "dsdk_verify_legacy";
		const legacy = await legacyHashToken(token);
		const hmac = await hashToken(token, secret);
		expect(legacy).not.toBe(hmac);
	});
});

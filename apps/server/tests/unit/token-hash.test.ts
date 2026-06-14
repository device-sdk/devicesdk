import { describe, expect, test } from "bun:test";
import {
	hashToken,
	legacyHashToken,
	verifyToken,
} from "../../src/foundation/tokenHash";

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

	test("verifyToken accepts an HMAC-stored hash", async () => {
		const token = "dsdk_verify_hmac";
		const stored = await hashToken(token, secret);
		expect(await verifyToken(token, stored, secret)).toBe(true);
		expect(await verifyToken("wrong-token", stored, secret)).toBe(false);
	});

	test("verifyToken falls back to legacy SHA-256 hash", async () => {
		const token = "dsdk_verify_legacy";
		const stored = await legacyHashToken(token);
		expect(await verifyToken(token, stored, secret)).toBe(true);
		expect(await verifyToken("wrong-token", stored, secret)).toBe(false);
	});

	test("verifyToken rejects a hash from a different secret", async () => {
		const token = "dsdk_wrong_secret";
		const stored = await hashToken(token, "other-secret");
		expect(await verifyToken(token, stored, secret)).toBe(false);
	});
});

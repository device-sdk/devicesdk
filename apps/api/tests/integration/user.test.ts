import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { TEST_SESSION_TOKEN } from "../setup-test-data";

describe.sequential("User endpoint", () => {
	describe("GET /v1/user/me", () => {
		it("should return the authenticated user's details", async () => {
			const resp = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			});

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.id).toBeDefined();
			expect(json.result.email).toBe("alice@example.com");
			expect(json.result.name).toBe("Alice Johnson");
			expect(json.result.verified_email).toBe(1);
			expect(json.result.created_at).toBeDefined();
		});

		it("should return 401 without auth", async () => {
			const resp = await SELF.fetch("http://localhost/v1/user/me", {
				method: "GET",
			});

			expect(resp.status).toBe(401);
		});
	});
});

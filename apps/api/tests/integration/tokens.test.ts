import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

describe.sequential("Tokens endpoint", () => {
	let qb: D1QB;

	beforeAll(() => {
		qb = new D1QB(env.DB);
	});

	beforeEach(async () => {
		// Per-test isolation: clear tokens created by previous it() blocks.
		// (Pool-workers 0.13+ removed isolatedStorage, so writes now persist.)
		await env.DB.prepare("DELETE FROM tokens").run();
	});

	it("should create a new API token", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(201);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.id).toBeDefined();
		expect(json.result.token).toBeDefined();
		expect(json.result.token.includes("-")).toBe(false);
	});

	it("should be able to use an API token to authenticate", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		const json = await resp.json();
		const apiToken = json.result.token;

		const userDetailsResp = await SELF.fetch("http://localhost/v1/user/me", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
		});

		expect(userDetailsResp.status).toBe(200);
		const userDetailsJson = await userDetailsResp.json();
		expect(userDetailsJson.success).toBe(true);
		expect(userDetailsJson.result.id).toBe(TEST_USER_ID);
	});

	it("should list all API tokens for a user", async () => {
		// Create a token first
		const createResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		const createJson = await createResp.json();
		const token = createJson.result.token;

		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(200);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.items.length).toBe(1);
		expect(json.result.has_more).toBe(false);
		expect(json.result.items[0].id).toBeDefined();
		expect(json.result.items[0].token).toBeUndefined();
		expect(json.result.items[0].last_four).toBe(token.slice(-4));
	});

	it("should delete an API token", async () => {
		const createResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		const createJson = await createResp.json();
		const tokenId = createJson.result.id;

		const deleteResp = await SELF.fetch(
			`http://localhost/v1/tokens/${tokenId}`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			},
		);

		expect(deleteResp.status).toBe(200);
		const deleteJson = await deleteResp.json();
		expect(deleteJson.success).toBe(true);

		// Verify the token is gone
		const listResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		const listJson = await listResp.json();
		for (const t of listJson.result.items) {
			expect(t.id).not.eq(tokenId);
		}
	});

	// it("should not allow a user to have more than 50 tokens", async () => {
	// 	for (let i = 0; i < 50; i++) {
	// 		await SELF.fetch("http://localhost/v1/tokens", {
	// 			method: "POST",
	// 			headers: {
	// 				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
	// 			},
	// 		});
	// 	}
	//
	// 	const resp = await SELF.fetch("http://localhost/v1/tokens", {
	// 		method: "POST",
	// 		headers: {
	// 			Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
	// 		},
	// 	});
	//
	// 	expect(resp.status).toBe(500);
	// 	const json = await resp.json();
	// 	expect(json.success).toBe(false);
	// });

	it("should return 404 when deleting a non-existent token", async () => {
		const resp = await SELF.fetch(
			"http://localhost/v1/tokens/non-existent-token-id",
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			},
		);

		expect(resp.status).toBe(404);
		const json = await resp.json();
		expect(json.success).toBe(false);
	});

	it("should return 401 without auth when listing tokens", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "GET",
		});

		expect(resp.status).toBe(401);
	});

	it("should return 401 without auth when creating a token", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
		});

		expect(resp.status).toBe(401);
	});

	it("should return 401 without auth when deleting a token", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens/some-token-id", {
			method: "DELETE",
		});

		expect(resp.status).toBe(401);
	});

	it("should create a token with a description", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
			body: JSON.stringify({ description: "My CI token" }),
		});

		expect(resp.status).toBe(201);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.description).toBe("My CI token");
	});

	it("should surface description when listing tokens", async () => {
		const createResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
			body: JSON.stringify({ description: "Prod deploy key" }),
		});
		const createJson = await createResp.json();
		const tokenId = createJson.result.id;

		const listResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		const listJson = await listResp.json();
		const created = listJson.result.items.find(
			(t: { id: string }) => t.id === tokenId,
		);
		expect(created).toBeDefined();
		expect(created.description).toBe("Prod deploy key");
	});

	it("should create a token without a description when body is omitted", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(201);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.description == null).toBe(true);
	});

	it("should store token hash (not plaintext) in DB", async () => {
		const resp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		expect(resp.status).toBe(201);
		const json = (await resp.json()) as {
			result: { id: string; token: string };
		};
		const rawToken = json.result.token;
		expect(rawToken).toBeDefined();
		expect(rawToken.length).toBeGreaterThan(0);

		// Verify DB stores hash, not plaintext
		const dbToken = await env.DB.prepare(
			"SELECT token, token_hash, last_four FROM tokens WHERE id = ?",
		)
			.bind(json.result.id)
			.first<{ token: string; token_hash: string; last_four: string }>();

		expect(dbToken).not.toBeNull();
		expect(dbToken!.token).toBe(""); // plaintext should be empty
		expect(dbToken!.token_hash).toBeDefined();
		expect(dbToken!.token_hash).not.toBe(rawToken); // hash != raw
		expect(dbToken!.last_four).toBe(rawToken.slice(-4));
	});

	it("should authenticate with raw API token after hashing", async () => {
		const createResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		const rawToken = (
			(await createResp.json()) as { result: { token: string } }
		).result.token;

		const authResp = await SELF.fetch("http://localhost/v1/user/me", {
			headers: { Authorization: `Bearer ${rawToken}` },
		});
		expect(authResp.status).toBe(200);
	});

	describe("GET /v1/tokens - pagination", () => {
		it("should return paginated results with default limit", async () => {
			const resp = await SELF.fetch("http://localhost/v1/tokens", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			});

			expect(resp.status).toBe(200);
			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.items).toBeDefined();
			expect(Array.isArray(json.result.items)).toBe(true);
			expect(typeof json.result.has_more).toBe("boolean");
			expect(typeof json.result.page).toBe("number");
			expect(typeof json.result.per_page).toBe("number");
		});

		it("should paginate with page/per_page across multiple pages", async () => {
			// Create 5 tokens
			for (let i = 0; i < 5; i++) {
				await SELF.fetch("http://localhost/v1/tokens", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				});
			}

			// First page with per_page=2
			const resp1 = await SELF.fetch("http://localhost/v1/tokens?per_page=2", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			});

			expect(resp1.status).toBe(200);
			const json1 = await resp1.json();
			expect(json1.success).toBe(true);
			expect(json1.result.items.length).toBe(2);
			expect(json1.result.page).toBe(1);
			expect(json1.result.has_more).toBe(true);

			// Second page
			const resp2 = await SELF.fetch(
				"http://localhost/v1/tokens?per_page=2&page=2",
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
					},
				},
			);
			const json2 = await resp2.json();
			expect(json2.success).toBe(true);
			expect(json2.result.items.length).toBeGreaterThanOrEqual(1);
			expect(json2.result.page).toBe(2);

			// Ensure no overlap between pages
			const page1Ids = json1.result.items.map((t: { id: string }) => t.id);
			const page2Ids = json2.result.items.map((t: { id: string }) => t.id);
			for (const id of page2Ids) {
				expect(page1Ids).not.toContain(id);
			}
		});

		it("should return has_more=false on last page", async () => {
			const resp = await SELF.fetch("http://localhost/v1/tokens?per_page=100", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			});

			const json = await resp.json();
			expect(json.success).toBe(true);
			expect(json.result.has_more).toBe(false);
		});
	});

	it("should reject authentication with token hash value", async () => {
		const createResp = await SELF.fetch("http://localhost/v1/tokens", {
			method: "POST",
			headers: { Authorization: `Bearer ${TEST_SESSION_TOKEN}` },
		});
		const tokenId = ((await createResp.json()) as { result: { id: string } })
			.result.id;

		const dbToken = await env.DB.prepare(
			"SELECT token_hash FROM tokens WHERE id = ?",
		)
			.bind(tokenId)
			.first<{ token_hash: string }>();

		const authResp = await SELF.fetch("http://localhost/v1/user/me", {
			headers: { Authorization: `Bearer ${dbToken!.token_hash}` },
		});
		expect(authResp.status).toBe(401);
	});
});

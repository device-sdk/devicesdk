import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { D1QB } from "workers-qb";
import type { tableUser, tableUserSessions } from "../../src/types";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

describe.sequential("Tokens endpoint", () => {
	let qb: D1QB;

	beforeAll(() => {
		qb = new D1QB(env.DB);
	});

	beforeEach(async () => {});

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
		expect(json.result.length).toBe(1);
		expect(json.result[0].id).toBeDefined();
		expect(json.result[0].token).toBeUndefined();
		expect(json.result[0].last_four).toBe(token.slice(-4));
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
		for (const t of listJson.result) {
			expect(t.id).not.eq(tokenId)
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
});

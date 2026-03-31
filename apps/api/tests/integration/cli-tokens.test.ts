import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

describe.sequential("CLI Tokens endpoint", () => {
	beforeEach(async () => {
		await env.DB.prepare("DELETE FROM cli_tokens").run();
	});

	it("should list CLI tokens for authenticated user", async () => {
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-1",
				TEST_USER_ID,
				"test-hash-1",
				"test-refresh-hash-1",
				now,
				now + 86400000,
				now - 3600000,
			)
			.run();

		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-2",
				TEST_USER_ID,
				"test-hash-2",
				"test-refresh-hash-2",
				now - 1000,
				now + 86400000,
			)
			.run();

		const resp = await SELF.fetch("http://localhost/v1/tokens/cli", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(200);
		const json = (await resp.json()) as {
			success: boolean;
			result: Array<{
				id: string;
				created_at: number;
				expires_at: number;
				last_used_at: number | null;
			}>;
		};
		expect(json.success).toBe(true);
		expect(json.result).toHaveLength(2);
		// Ordered by created_at DESC so cli-token-1 comes first
		expect(json.result[0].id).toBe("cli-token-1");
		expect(json.result[0].created_at).toBe(now);
		expect(json.result[0].expires_at).toBe(now + 86400000);
		expect(json.result[0].last_used_at).toBe(now - 3600000);
		expect(json.result[1].id).toBe("cli-token-2");
		expect(json.result[1].last_used_at).toBeNull();
	});

	it("should not return token hashes", async () => {
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-hash-check",
				TEST_USER_ID,
				"secret-access-hash",
				"secret-refresh-hash",
				now,
				now + 86400000,
			)
			.run();

		const resp = await SELF.fetch("http://localhost/v1/tokens/cli", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(200);
		const text = await resp.text();
		expect(text).not.toContain("secret-access-hash");
		expect(text).not.toContain("secret-refresh-hash");
		expect(text).not.toContain("access_token_hash");
		expect(text).not.toContain("refresh_token_hash");
	});

	it("should not list another user's CLI tokens", async () => {
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-other-user",
				"user-2",
				"other-hash",
				"other-refresh-hash",
				now,
				now + 86400000,
			)
			.run();

		const resp = await SELF.fetch("http://localhost/v1/tokens/cli", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(200);
		const json = (await resp.json()) as {
			success: boolean;
			result: Array<{ id: string }>;
		};
		expect(json.success).toBe(true);
		expect(json.result).toHaveLength(0);
	});

	it("should revoke a CLI token", async () => {
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-to-delete",
				TEST_USER_ID,
				"delete-hash",
				"delete-refresh-hash",
				now,
				now + 86400000,
			)
			.run();

		const deleteResp = await SELF.fetch(
			"http://localhost/v1/tokens/cli/cli-token-to-delete",
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			},
		);

		expect(deleteResp.status).toBe(200);
		const deleteJson = (await deleteResp.json()) as {
			success: boolean;
			result: { deleted: boolean };
		};
		expect(deleteJson.success).toBe(true);
		expect(deleteJson.result.deleted).toBe(true);

		// Verify it's gone
		const listResp = await SELF.fetch("http://localhost/v1/tokens/cli", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});
		const listJson = (await listResp.json()) as {
			success: boolean;
			result: Array<{ id: string }>;
		};
		expect(listJson.result).toHaveLength(0);
	});

	it("should return 404 when revoking another user's CLI token", async () => {
		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cli_tokens (id, user_id, access_token_hash, refresh_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				"cli-token-not-mine",
				"user-2",
				"not-mine-hash",
				"not-mine-refresh-hash",
				now,
				now + 86400000,
			)
			.run();

		const resp = await SELF.fetch(
			"http://localhost/v1/tokens/cli/cli-token-not-mine",
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			},
		);

		expect(resp.status).toBe(404);
		const json = (await resp.json()) as {
			success: boolean;
			error: string;
		};
		expect(json.success).toBe(false);
		expect(json.error).toBe("Token not found");
	});
});

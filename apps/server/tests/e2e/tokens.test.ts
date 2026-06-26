import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

let srv: TestServer;
let owner: TestUser;

interface CreatedToken {
	id: string;
	token: string;
	created_at: number;
	description?: string | null;
}

interface TokenListItem {
	id: string;
	created_at: number;
	last_four: string;
	description?: string | null;
	managed?: boolean;
}

beforeAll(async () => {
	srv = await TestServer.start();
	owner = await srv.register({
		email: `tokens-owner-${crypto.randomUUID()}@example.com`,
	});
});

afterAll(() => srv.stop());

describe("API tokens", () => {
	test("create returns the full token value once with id + created_at", async () => {
		const res = await srv.post("/v1/tokens", {
			token: owner.token,
			body: { description: "my laptop" },
		});
		expect(res.status).toBe(201);
		const result = (res.body as { success: boolean; result: CreatedToken })
			.result;
		expect(res.body).toMatchObject({ success: true });
		expect(typeof result.token).toBe("string");
		// raw token is a 32-char hex (uuid with dashes stripped)
		expect(result.token).toMatch(/^[0-9a-f]{32}$/);
		expect(typeof result.id).toBe("string");
		expect(typeof result.created_at).toBe("number");
		expect(result.description).toBe("my laptop");
	});

	test("created token authenticates a real API call (GET /v1/projects)", async () => {
		const created = await srv.post("/v1/tokens", { token: owner.token });
		const rawToken = (created.body as { result: CreatedToken }).result.token;

		const projects = await srv.get("/v1/projects", { token: rawToken });
		expect(projects.status).toBe(200);
		expect((projects.body as { success: boolean }).success).toBe(true);
	});

	test("list returns metadata only (last_four/description) - never the raw token", async () => {
		const created = await srv.post("/v1/tokens", {
			token: owner.token,
			body: { description: "listed-token" },
		});
		const result = (created.body as { result: CreatedToken }).result;
		const rawToken = result.token;
		const lastFour = rawToken.slice(-4);

		const list = await srv.get("/v1/tokens", { token: owner.token });
		expect(list.status).toBe(200);
		const items = (list.body as { result: { items: TokenListItem[] } }).result
			.items;
		const mine = items.find((t) => t.id === result.id);
		expect(mine).toBeDefined();
		expect(mine?.last_four).toBe(lastFour);
		expect(mine?.description).toBe("listed-token");
		// raw token never leaks in the list payload
		expect(list.text).not.toContain(rawToken);
		for (const item of items) {
			expect(item).not.toHaveProperty("token");
			expect(item).not.toHaveProperty("token_hash");
		}
	});

	test("list shape includes pagination fields", async () => {
		const list = await srv.get("/v1/tokens", { token: owner.token });
		const result = (
			list.body as {
				result: {
					items: unknown[];
					page: number;
					per_page: number;
					has_more: boolean;
				};
			}
		).result;
		expect(Array.isArray(result.items)).toBe(true);
		expect(result.page).toBe(1);
		expect(typeof result.per_page).toBe("number");
		expect(typeof result.has_more).toBe("boolean");
	});

	test("delete removes the token: it stops authenticating and leaves the list", async () => {
		const created = await srv.post("/v1/tokens", { token: owner.token });
		const result = (created.body as { result: CreatedToken }).result;
		const rawToken = result.token;

		// works before delete
		const before = await srv.get("/v1/projects", { token: rawToken });
		expect(before.status).toBe(200);

		const del = await srv.delete(`/v1/tokens/${result.id}`, {
			token: owner.token,
		});
		expect(del.status).toBe(200);
		expect((del.body as { success: boolean }).success).toBe(true);

		// no longer authenticates
		const after = await srv.get("/v1/projects", { token: rawToken });
		expect(after.status).toBe(401);

		// gone from the list
		const list = await srv.get("/v1/tokens", { token: owner.token });
		const items = (list.body as { result: { items: TokenListItem[] } }).result
			.items;
		expect(items.find((t) => t.id === result.id)).toBeUndefined();
	});

	test("delete unknown token id → 404", async () => {
		const del = await srv.delete(`/v1/tokens/${crypto.randomUUID()}`, {
			token: owner.token,
		});
		expect(del.status).toBe(404);
		expect((del.body as { success: boolean }).success).toBe(false);
	});

	test("cross-user isolation: cannot delete another user's token", async () => {
		const created = await srv.post("/v1/tokens", { token: owner.token });
		const tokenId = (created.body as { result: CreatedToken }).result.id;

		const other = await srv.register({
			email: `tokens-other-${crypto.randomUUID()}@example.com`,
		});

		// other user's list does not include owner's token
		const list = await srv.get("/v1/tokens", { token: other.token });
		const items = (list.body as { result: { items: TokenListItem[] } }).result
			.items;
		expect(items.find((t) => t.id === tokenId)).toBeUndefined();

		// other user deleting owner's token → 404 (scoped by user_id)
		const del = await srv.delete(`/v1/tokens/${tokenId}`, {
			token: other.token,
		});
		expect(del.status).toBe(404);

		// owner's token still works
		const stillThere = await srv.get("/v1/tokens", { token: owner.token });
		const ownerItems = (
			stillThere.body as { result: { items: TokenListItem[] } }
		).result.items;
		expect(ownerItems.find((t) => t.id === tokenId)).toBeDefined();
	});

	test("unauthenticated requests are rejected with 401", async () => {
		expect((await srv.get("/v1/tokens")).status).toBe(401);
		expect((await srv.post("/v1/tokens", { body: {} })).status).toBe(401);
		expect((await srv.delete(`/v1/tokens/${crypto.randomUUID()}`)).status).toBe(
			401,
		);
	});
});

describe("CLI tokens", () => {
	test("list is empty for a fresh user with the documented shape", async () => {
		const fresh = await srv.register({
			email: `cli-fresh-${crypto.randomUUID()}@example.com`,
		});
		const list = await srv.get("/v1/tokens/cli", { token: fresh.token });
		expect(list.status).toBe(200);
		const body = list.body as { success: boolean; result: unknown[] };
		expect(body.success).toBe(true);
		expect(Array.isArray(body.result)).toBe(true);
		expect(body.result.length).toBe(0);
	});

	test("delete unknown CLI token id → 404", async () => {
		const del = await srv.delete(`/v1/tokens/cli/${crypto.randomUUID()}`, {
			token: owner.token,
		});
		expect(del.status).toBe(404);
		expect((del.body as { success: boolean }).success).toBe(false);
	});

	test("CLI token endpoints reject unauthenticated requests", async () => {
		expect((await srv.get("/v1/tokens/cli")).status).toBe(401);
		expect(
			(await srv.delete(`/v1/tokens/cli/${crypto.randomUUID()}`)).status,
		).toBe(401);
	});
});

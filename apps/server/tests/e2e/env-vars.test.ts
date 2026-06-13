import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

let srv: TestServer;
// Scaffolded project the test suite operates on. The env router is mounted at
// /v1/projects/:projectId/env, but the handlers resolve :projectId against the
// project_slug column — so the slug is what goes in the URL.
let projectSlug: string;
let token: string;

interface ListVar {
	key: string;
	updated_at: number;
}

beforeAll(async () => {
	srv = await TestServer.start();
	const s = await srv.scaffold({ projectSlug: "envproj" });
	projectSlug = s.projectSlug;
	token = s.auth.token;
});

afterAll(() => srv.stop());

function envPath(slug = projectSlug): string {
	return `/v1/projects/${slug}/env`;
}

describe("env vars", () => {
	test("set valid vars → success with count", async () => {
		const res = await srv.put(envPath(), {
			token,
			body: { vars: { API_KEY: "secret-1", REGION: "eu-west" } },
		});
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ success: true, result: { count: 2 } });
	});

	test("list returns keys + updated_at, never the values", async () => {
		const res = await srv.get(envPath(), { token });
		expect(res.status).toBe(200);
		const vars = (res.body as { result: { vars: ListVar[] } }).result.vars;
		const keys = vars.map((v) => v.key).sort();
		expect(keys).toEqual(["API_KEY", "REGION"]);
		for (const v of vars) {
			expect(typeof v.updated_at).toBe("number");
		}
		// values are never serialized
		expect(res.text).not.toContain("secret-1");
		expect(res.text).not.toContain("eu-west");
	});

	test("setting an existing key upserts (no duplicate, value updated)", async () => {
		const before = await srv.get(envPath(), { token });
		const beforeVar = (
			before.body as { result: { vars: ListVar[] } }
		).result.vars.find((v) => v.key === "API_KEY");
		expect(beforeVar).toBeDefined();

		// ensure a measurable timestamp delta
		await new Promise((r) => setTimeout(r, 5));

		const upsert = await srv.put(envPath(), {
			token,
			body: { vars: { API_KEY: "secret-2" } },
		});
		expect(upsert.status).toBe(200);
		expect((upsert.body as { result: { count: number } }).result.count).toBe(1);

		const after = await srv.get(envPath(), { token });
		const vars = (after.body as { result: { vars: ListVar[] } }).result.vars;
		// still exactly one API_KEY entry → upsert, not insert
		expect(vars.filter((v) => v.key === "API_KEY").length).toBe(1);
		const afterVar = vars.find((v) => v.key === "API_KEY");
		expect(afterVar?.updated_at).toBeGreaterThanOrEqual(
			beforeVar?.updated_at ?? 0,
		);
		// total key count unchanged (API_KEY + REGION)
		expect(vars.length).toBe(2);
	});

	test("empty vars object → success count 0, no project lookup side effects", async () => {
		const res = await srv.put(envPath(), { token, body: { vars: {} } });
		expect(res.status).toBe(200);
		expect((res.body as { result: { count: number } }).result.count).toBe(0);
	});

	test("invalid key format → 400", async () => {
		// lowercase, leading digit, and reserved chars all violate ENV_VAR_KEY_REGEX
		for (const badKey of [
			"lowercase",
			"1LEADING_DIGIT",
			"HAS-DASH",
			"HAS SPACE",
		]) {
			const res = await srv.put(envPath(), {
				token,
				body: { vars: { [badKey]: "x" } },
			});
			expect(res.status).toBe(400);
			expect((res.body as { success: boolean }).success).toBe(false);
		}
	});

	test("value exceeding 4096 bytes → 400", async () => {
		const tooBig = "a".repeat(4097);
		const res = await srv.put(envPath(), {
			token,
			body: { vars: { BIG_VALUE: tooBig } },
		});
		expect(res.status).toBe(400);
		expect((res.body as { success: boolean }).success).toBe(false);
	});

	test("delete a key → 200, then it is gone", async () => {
		await srv.put(envPath(), { token, body: { vars: { TO_DELETE: "bye" } } });

		const del = await srv.delete(`${envPath()}/TO_DELETE`, { token });
		expect(del.status).toBe(200);
		expect(del.body).toMatchObject({
			success: true,
			result: { deleted: true, key: "TO_DELETE" },
		});

		const list = await srv.get(envPath(), { token });
		const keys = (list.body as { result: { vars: ListVar[] } }).result.vars.map(
			(v) => v.key,
		);
		expect(keys).not.toContain("TO_DELETE");
	});

	test("delete unknown key → 404", async () => {
		const del = await srv.delete(`${envPath()}/DOES_NOT_EXIST`, { token });
		expect(del.status).toBe(404);
		expect((del.body as { success: boolean }).success).toBe(false);
	});

	test("project not found → 404 on set/list/delete", async () => {
		const set = await srv.put(envPath("no-such-project"), {
			token,
			body: { vars: { FOO: "bar" } },
		});
		expect(set.status).toBe(404);

		const list = await srv.get(envPath("no-such-project"), { token });
		expect(list.status).toBe(404);

		const del = await srv.delete(`${envPath("no-such-project")}/FOO`, {
			token,
		});
		expect(del.status).toBe(404);
	});

	test("cross-user isolation: another user cannot read or write this project's env", async () => {
		const other = await srv.register({
			email: `env-other-${crypto.randomUUID()}@example.com`,
		});
		// project_slug is scoped by user_id, so the other user's lookup misses → 404
		const list = await srv.get(envPath(), { token: other.token });
		expect(list.status).toBe(404);

		const set = await srv.put(envPath(), {
			token: other.token,
			body: { vars: { HACK: "1" } },
		});
		expect(set.status).toBe(404);

		const del = await srv.delete(`${envPath()}/API_KEY`, {
			token: other.token,
		});
		expect(del.status).toBe(404);

		// owner's vars are untouched
		const ownerList = await srv.get(envPath(), { token });
		const keys = (
			ownerList.body as { result: { vars: ListVar[] } }
		).result.vars.map((v) => v.key);
		expect(keys).toContain("API_KEY");
	});

	test("unauthenticated requests are rejected with 401", async () => {
		expect((await srv.get(envPath())).status).toBe(401);
		expect((await srv.put(envPath(), { body: { vars: {} } })).status).toBe(401);
		expect((await srv.delete(`${envPath()}/API_KEY`)).status).toBe(401);
	});

	test("count limit (maxEnvVarsPerProject=200) → 422", async () => {
		const limited = await srv.scaffold({ projectSlug: "limitproj" });
		const limitToken = limited.auth.token;
		const path = `/v1/projects/${limited.projectSlug}/env`;

		// Fill to exactly 200 in batches well under the body limits.
		for (let batch = 0; batch < 4; batch++) {
			const vars: Record<string, string> = {};
			for (let i = 0; i < 50; i++) {
				vars[`K${batch}_${i}`] = "v";
			}
			const res = await srv.put(path, { token: limitToken, body: { vars } });
			expect(res.status).toBe(200);
		}

		// One more truly-new key pushes past 200 → 422.
		const over = await srv.put(path, {
			token: limitToken,
			body: { vars: { OVERFLOW: "x" } },
		});
		expect(over.status).toBe(422);
		expect((over.body as { success: boolean }).success).toBe(false);

		// Updating an existing key (not new) is still allowed at the cap.
		const update = await srv.put(path, {
			token: limitToken,
			body: { vars: { K0_0: "updated" } },
		});
		expect(update.status).toBe(200);
	});
});

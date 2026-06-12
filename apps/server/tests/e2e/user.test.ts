import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

let srv: TestServer;

let ipCounter = 0;

/**
 * Register a user under a unique X-Forwarded-For so each call gets its own
 * rate-limit window (the limiter is keyed by client IP + path, a process-global
 * Map shared across files). Avoids tripping the 10/min register cap.
 */
async function registerUser(email: string, name?: string): Promise<TestUser> {
	const ip = `10.1.0.${ipCounter++}`;
	const res = await srv.post("/v1/auth/register", {
		body: { email, password: "password123", name },
		headers: { "x-forwarded-for": ip },
	});
	if (res.status !== 200) {
		throw new Error(`register failed: ${res.status} ${res.text}`);
	}
	const raw = res.headers.get("set-cookie") ?? "";
	const match = raw.match(/devicesdk-session=([^;]+)/);
	if (!match) throw new Error("no session cookie from register");
	const token = decodeURIComponent(match[1]);
	const user = (res.body as { result: TestUser["user"] }).result;
	return { token, user };
}

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

type UserDetailsResult = {
	id: string;
	name?: string;
	email: string;
	verified_email: number;
	created_at: number;
	onboarding_completed: number;
	limits: {
		max_projects: number;
		max_devices_per_project: number;
		max_script_versions_per_device: number;
		max_api_tokens: number;
		max_env_vars_per_project: number;
	};
	usage: { projects: number; api_tokens: number };
};

describe("user API", () => {
	test("GET /v1/user/me requires authentication", async () => {
		const res = await srv.get("/v1/user/me");
		expect(res.status).toBe(401);
	});

	test("GET /v1/user/me returns the authenticated user's details", async () => {
		const auth = await registerUser("me@example.com", "Me User");
		const res = await srv.get("/v1/user/me", { token: auth.token });
		expect(res.status).toBe(200);
		const body = res.body as { success: boolean; result: UserDetailsResult };
		expect(body.success).toBe(true);
		expect(body.result.id).toBe(auth.user.id);
		expect(body.result.email).toBe("me@example.com");
		expect(body.result.name).toBe("Me User");
		expect(body.result.onboarding_completed).toBe(0);
		expect(typeof body.result.created_at).toBe("number");
		// limits mirror RESOURCE_LIMITS
		expect(body.result.limits.max_projects).toBe(100);
		expect(body.result.limits.max_devices_per_project).toBe(100);
		// usage starts empty
		expect(body.result.usage.projects).toBe(0);
		expect(body.result.usage.api_tokens).toBe(0);
	});

	test("usage.projects reflects created projects", async () => {
		const auth = await registerUser("usage@example.com");
		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "u1" },
		});
		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "u2" },
		});
		const res = await srv.get("/v1/user/me", { token: auth.token });
		expect(
			(res.body as { result: UserDetailsResult }).result.usage.projects,
		).toBe(2);
	});

	test("PATCH /v1/user/me/onboarding flips onboarding_completed", async () => {
		const auth = await registerUser("onboard@example.com");
		const before = await srv.get("/v1/user/me", { token: auth.token });
		expect(
			(before.body as { result: UserDetailsResult }).result
				.onboarding_completed,
		).toBe(0);

		const patch = await srv.patch("/v1/user/me/onboarding", {
			token: auth.token,
		});
		expect(patch.status).toBe(200);
		expect((patch.body as { success: boolean }).success).toBe(true);

		const after = await srv.get("/v1/user/me", { token: auth.token });
		expect(
			(after.body as { result: UserDetailsResult }).result.onboarding_completed,
		).toBe(1);
	});

	test("PATCH onboarding requires authentication", async () => {
		const res = await srv.patch("/v1/user/me/onboarding");
		expect(res.status).toBe(401);
	});

	test("DELETE /v1/user/me purges the user and invalidates the token", async () => {
		// Build a user with a project + device so purge has data to remove.
		const auth = await registerUser("doomed@example.com");
		const token = auth.token;
		const userId = auth.user.id;
		const projectSlug = "doomed";
		const deviceSlug = "dvc";
		const projRes = await srv.post("/v1/projects", {
			token,
			body: { project_slug: projectSlug, name: "Doomed" },
		});
		expect(projRes.status).toBe(201);
		const projectId = (projRes.body as { result: { id: string } }).result.id;
		const devRes = await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token,
			body: { device_id: deviceSlug, name: "Doomed Device" },
		});
		expect(devRes.status).toBe(201);

		// upload a script so a blob exists to purge
		const up = await srv.put(
			`/v1/projects/${projectSlug}/devices/${deviceSlug}/script`,
			{
				token,
				body: {
					script:
						"export class Entry { constructor(c,e){} get crons(){return {};} }",
					entrypoint: "Entry",
				},
			},
		);
		expect(up.status).toBe(201);

		// sanity: authenticated before delete
		const pre = await srv.get("/v1/user/me", { token });
		expect(pre.status).toBe(200);

		const del = await srv.delete("/v1/user/me", { token });
		expect(del.status).toBe(200);
		expect((del.body as { result: { deleted: boolean } }).result.deleted).toBe(
			true,
		);

		// token no longer authenticates
		const post = await srv.get("/v1/user/me", { token });
		expect(post.status).toBe(401);

		// data fully purged from the DB
		const userRow = srv.db
			.query("SELECT COUNT(*) as c FROM user WHERE id = ?")
			.get(userId) as { c: number };
		expect(userRow.c).toBe(0);
		const projRow = srv.db
			.query("SELECT COUNT(*) as c FROM projects WHERE user_id = ?")
			.get(userId) as { c: number };
		expect(projRow.c).toBe(0);
		const devRow = srv.db
			.query("SELECT COUNT(*) as c FROM devices WHERE project_id = ?")
			.get(projectId) as { c: number };
		expect(devRow.c).toBe(0);
		const sessionRow = srv.db
			.query("SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ?")
			.get(userId) as { c: number };
		expect(sessionRow.c).toBe(0);
	});
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer, type TestUser } from "../harness";

let srv: TestServer;

type Project = {
	id: string;
	project_slug: string;
	name: string | null;
	description: string | null;
	created_at: number;
};

let ipCounter = 0;

/**
 * Register a user with a unique X-Forwarded-For so each call lands in its own
 * rate-limit window (the limiter is keyed by client IP + path and is a
 * process-global Map). The harness's `register` shares one "unknown" IP, which
 * trips the 10/min cap once a suite needs many distinct users.
 */
async function registerUser(email: string): Promise<TestUser> {
	const ip = `10.0.0.${ipCounter++}`;
	const res = await srv.post("/v1/auth/register", {
		body: { email, password: "password123" },
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

describe("projects API", () => {
	test("requires authentication", async () => {
		const res = await srv.get("/v1/projects");
		expect(res.status).toBe(401);
	});

	test("create returns 201 with the project shape", async () => {
		const auth = await registerUser("creator@example.com");
		const res = await srv.post("/v1/projects", {
			token: auth.token,
			body: {
				project_slug: "alpha",
				name: "Alpha",
				description: "first project",
			},
		});
		expect(res.status).toBe(201);
		const body = res.body as { success: boolean; result: Project };
		expect(body.success).toBe(true);
		expect(body.result.project_slug).toBe("alpha");
		expect(body.result.name).toBe("Alpha");
		expect(body.result.description).toBe("first project");
		expect(typeof body.result.id).toBe("string");
		expect(typeof body.result.created_at).toBe("number");
	});

	test("create with only a slug nulls name/description", async () => {
		const auth = await registerUser("creator2@example.com");
		const res = await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "barebones" },
		});
		expect(res.status).toBe(201);
		const body = res.body as { result: Project };
		expect(body.result.name).toBeNull();
		expect(body.result.description).toBeNull();
	});

	test("invalid slug format returns 400", async () => {
		const auth = await registerUser("badslug@example.com");
		// Starts with a digit / uppercase / underscore — all violate the regex.
		for (const slug of ["1bad", "Bad", "has_underscore", "-leading"]) {
			const res = await srv.post("/v1/projects", {
				token: auth.token,
				body: { project_slug: slug },
			});
			expect(res.status).toBe(400);
			expect((res.body as { success: boolean }).success).toBe(false);
		}
	});

	test("duplicate slug for same user returns 409", async () => {
		const auth = await registerUser("dup@example.com");
		const first = await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "dupe" },
		});
		expect(first.status).toBe(201);
		const second = await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "dupe" },
		});
		expect(second.status).toBe(409);
		expect((second.body as { error: string }).error).toBe(
			"Project already exists",
		);
	});

	test("same slug is allowed across different users", async () => {
		const a = await registerUser("tenant-a@example.com");
		const b = await registerUser("tenant-b@example.com");
		const ra = await srv.post("/v1/projects", {
			token: a.token,
			body: { project_slug: "shared" },
		});
		const rb = await srv.post("/v1/projects", {
			token: b.token,
			body: { project_slug: "shared" },
		});
		expect(ra.status).toBe(201);
		expect(rb.status).toBe(201);
	});

	test("list is empty for a fresh user, then populated", async () => {
		const auth = await registerUser("lister@example.com");
		const empty = await srv.get("/v1/projects", { token: auth.token });
		expect(empty.status).toBe(200);
		const emptyBody = empty.body as {
			result: {
				items: Project[];
				page: number;
				per_page: number;
				has_more: boolean;
			};
		};
		expect(emptyBody.result.items).toEqual([]);
		expect(emptyBody.result.page).toBe(1);
		expect(emptyBody.result.per_page).toBe(50);
		expect(emptyBody.result.has_more).toBe(false);

		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "one" },
		});
		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "two" },
		});

		const populated = await srv.get("/v1/projects", { token: auth.token });
		const items = (populated.body as { result: { items: Project[] } }).result
			.items;
		expect(items.length).toBe(2);
		const slugs = items.map((p) => p.project_slug).sort();
		expect(slugs).toEqual(["one", "two"]);
		// list items expose id/project_slug/created_at only
		expect(items[0]).toHaveProperty("id");
		expect(items[0]).toHaveProperty("created_at");
	});

	test("list pagination sets has_more and respects per_page", async () => {
		const auth = await registerUser("paginate@example.com");
		for (const slug of ["p1", "p2", "p3"]) {
			await srv.post("/v1/projects", {
				token: auth.token,
				body: { project_slug: slug },
			});
		}
		const page1 = await srv.get("/v1/projects", {
			token: auth.token,
			query: { per_page: 2, page: 1 },
		});
		const r1 = (
			page1.body as { result: { items: Project[]; has_more: boolean } }
		).result;
		expect(r1.items.length).toBe(2);
		expect(r1.has_more).toBe(true);

		const page2 = await srv.get("/v1/projects", {
			token: auth.token,
			query: { per_page: 2, page: 2 },
		});
		const r2 = (
			page2.body as { result: { items: Project[]; has_more: boolean } }
		).result;
		expect(r2.items.length).toBe(1);
		expect(r2.has_more).toBe(false);
	});

	test("get by slug returns nested device_count + devices, 404 when missing", async () => {
		const scaf = await srv.scaffold({
			projectSlug: "withdev",
			deviceSlug: "d1",
		});
		const res = await srv.get(`/v1/projects/${scaf.projectSlug}`, {
			token: scaf.auth.token,
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					id: string;
					project_slug: string;
					device_count: number;
					devices: Array<{
						device_id: string;
						name: string | null;
						status: string;
						last_connected_at: number | null;
					}>;
				};
			}
		).result;
		expect(result.project_slug).toBe("withdev");
		expect(result.device_count).toBe(1);
		expect(result.devices.length).toBe(1);
		expect(result.devices[0].device_id).toBe("d1");
		expect(result.devices[0].status).toBe("offline");
		expect(result.devices[0].last_connected_at).toBeNull();

		const missing = await srv.get("/v1/projects/nope", {
			token: scaf.auth.token,
		});
		expect(missing.status).toBe(404);
		expect((missing.body as { error: string }).error).toBe("Project not found");
	});

	test("update name + description returns 200 and new values", async () => {
		const auth = await registerUser("updater@example.com");
		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "tochange", name: "Old", description: "old desc" },
		});
		const res = await srv.put("/v1/projects/tochange", {
			token: auth.token,
			body: { name: "New", description: "new desc" },
		});
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: {
					project_slug: string;
					name: string | null;
					description: string | null;
					updated_at: number;
				};
			}
		).result;
		expect(result.project_slug).toBe("tochange");
		expect(result.name).toBe("New");
		expect(result.description).toBe("new desc");
		expect(typeof result.updated_at).toBe("number");

		// Verify persistence via get (get returns name/description too)
		const fetched = await srv.get("/v1/projects/tochange", {
			token: auth.token,
		});
		const fr = (
			fetched.body as { result: { name: string; description: string } }
		).result;
		expect(fr.name).toBe("New");
		expect(fr.description).toBe("new desc");
	});

	test("update of missing project returns 404", async () => {
		const auth = await registerUser("update404@example.com");
		const res = await srv.put("/v1/projects/ghost", {
			token: auth.token,
			body: { name: "X" },
		});
		expect(res.status).toBe(404);
	});

	test("delete returns 200 with deleted=true, then 404 on re-delete", async () => {
		const auth = await registerUser("deleter@example.com");
		await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "trash" },
		});
		const del = await srv.delete("/v1/projects/trash", { token: auth.token });
		expect(del.status).toBe(200);
		const result = (
			del.body as { result: { deleted: boolean; project_slug: string } }
		).result;
		expect(result.deleted).toBe(true);
		expect(result.project_slug).toBe("trash");

		// gone now
		const get = await srv.get("/v1/projects/trash", { token: auth.token });
		expect(get.status).toBe(404);
		const reDel = await srv.delete("/v1/projects/trash", { token: auth.token });
		expect(reDel.status).toBe(404);
	});

	test("delete cascades to devices", async () => {
		const scaf = await srv.scaffold({
			projectSlug: "cascade",
			deviceSlug: "dd",
		});
		const del = await srv.delete(`/v1/projects/${scaf.projectSlug}`, {
			token: scaf.auth.token,
		});
		expect(del.status).toBe(200);
		// device list under the deleted project is gone (project 404)
		const get = await srv.get(`/v1/projects/${scaf.projectSlug}`, {
			token: scaf.auth.token,
		});
		expect(get.status).toBe(404);
	});

	describe("cross-user isolation", () => {
		test("a second user cannot see/get/update/delete another's project", async () => {
			const owner = await registerUser("owner-iso@example.com");
			const intruder = await registerUser("intruder@example.com");
			await srv.post("/v1/projects", {
				token: owner.token,
				body: { project_slug: "private" },
			});

			// not in intruder's list
			const list = await srv.get("/v1/projects", { token: intruder.token });
			expect(
				(list.body as { result: { items: Project[] } }).result.items,
			).toEqual([]);

			// get → 404
			const get = await srv.get("/v1/projects/private", {
				token: intruder.token,
			});
			expect(get.status).toBe(404);

			// update → 404
			const upd = await srv.put("/v1/projects/private", {
				token: intruder.token,
				body: { name: "hacked" },
			});
			expect(upd.status).toBe(404);

			// delete → 404
			const del = await srv.delete("/v1/projects/private", {
				token: intruder.token,
			});
			expect(del.status).toBe(404);

			// owner still has it intact
			const ownerGet = await srv.get("/v1/projects/private", {
				token: owner.token,
			});
			expect(ownerGet.status).toBe(200);
			expect(
				(ownerGet.body as { result: { name: string | null } }).result.name,
			).toBeNull();
		});
	});

	test("enforceResourceLimit blocks creation at the project cap", async () => {
		// Use a tiny override via direct DB seeding is impractical; instead drive
		// the real branch by inserting maxProjects rows quickly through the API
		// would be slow (100). Cover the helper's 403 branch by seeding the DB
		// directly with the project limit, then issuing one more create.
		const auth = await registerUser("limit@example.com");
		const now = Date.now();
		const insert = srv.db.prepare(
			"INSERT INTO projects (id, user_id, project_slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		);
		for (let i = 0; i < 100; i++) {
			insert.run(
				crypto.randomUUID(),
				auth.user.id,
				`seed-${i}`,
				null,
				null,
				now,
				now,
			);
		}
		const res = await srv.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: "overflow" },
		});
		expect(res.status).toBe(403);
		expect((res.body as { error: string }).error).toContain("Limit reached");
		expect((res.body as { error: string }).error).toContain("100/100 projects");
	});
});

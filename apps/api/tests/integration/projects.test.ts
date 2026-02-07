import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type {
	tableProjects,
	tableProjectVersions,
	tableUser,
	tableUserSessions,
} from "../../src/types";
import { TEST_SESSION_TOKEN, TEST_USER_ID } from "../setup-test-data";

describe.sequential("Projects endpoint", () => {
	let qb: D1QB;

	beforeAll(() => {
		qb = new D1QB(env.DB);
	});

	beforeEach(async () => {});

	it("should create a new project", async () => {
		const resp = await SELF.fetch("http://localhost/v1/projects", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
			body: JSON.stringify({
				project_slug: "my-first-project",
			}),
		});

		expect(resp.status).toBe(201);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.id).toBeDefined();
		expect(json.result.project_slug).toBe("my-first-project");

		const project = await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["project_slug = ?1"],
					params: ["my-first-project"],
				},
			})
			.execute()
			.then((p) => p.results);
		expect(project).toBeDefined();
	});

	it("should return 409 for duplicate project_slug", async () => {
		await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: {
					id: "proj-100",
					user_id: TEST_USER_ID,
					project_slug: "existing-project-100",
					created_at: Date.now(),
				},
			})
			.execute();

		const resp = await SELF.fetch("http://localhost/v1/projects", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
			body: JSON.stringify({
				project_slug: "existing-project-100",
			}),
		});

		expect(resp.status).toBe(409);
		const json = await resp.json();
		expect(json.success).toBe(false);
	});

	it("should return 401 if no token is provided", async () => {
		const resp = await SELF.fetch("http://localhost/v1/projects", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				project_slug: "my-first-project",
			}),
		});
		expect(resp.status).toBe(401);
	});

	it.skip("should return 400 if project_slug is invalid format", async () => {
		const resp = await SELF.fetch("http://localhost/v1/projects", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
			body: JSON.stringify({
				project_slug: "Invalid_Project_ID",
			}),
		});
		expect(resp.status).toBe(400);
	});

	it("should list all projects for a user", async () => {
		await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: {
					id: "proj-200",
					user_id: TEST_USER_ID,
					project_slug: "existing-project-200",
					created_at: Date.now(),
				},
				returning: "*",
			})
			.execute();

		await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: {
					id: "proj-300",
					user_id: TEST_USER_ID,
					project_slug: "another-project-300",
					created_at: Date.now(),
				},
				returning: "*",
			})
			.execute();

		const resp = await SELF.fetch("http://localhost/v1/projects", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
			},
		});

		expect(resp.status).toBe(200);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.length).toBeGreaterThanOrEqual(2);
		const projectSlugs = json.result.map((p: any) => p.project_slug);
		expect(projectSlugs).toContain("existing-project-200");
		expect(projectSlugs).toContain("another-project-300");
	});

	it("should get a single project by id", async () => {
		await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: {
					id: "proj-400",
					user_id: TEST_USER_ID,
					project_slug: "existing-project-400",
					created_at: Date.now(),
				},
				returning: "*",
			})
			.execute();

		const resp = await SELF.fetch(
			"http://localhost/v1/projects/existing-project-400",
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
				},
			},
		);

		expect(resp.status).toBe(200);
		const json = await resp.json();
		expect(json.success).toBe(true);
		expect(json.result.project_slug).toBe("existing-project-400");
	});
});

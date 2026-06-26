import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deviceScriptSource, TestServer } from "../harness";

// Batch upload is mounted at PUT /v1/projects/:projectId/scripts and resolves
// :projectId against project_slug. Body shape:
//   { devices: { [deviceSlug]: { script, entrypoint } }, message? }
// Devices are auto-created when they don't already exist (status "created" vs
// "success"). Validation of every script runs BEFORE the project lookup, so a
// validation failure short-circuits with 400 even for a missing project.

let srv: TestServer;
let token: string;
let projectSlug: string;

function batchPath(p = projectSlug): string {
	return `/v1/projects/${p}/scripts`;
}

beforeAll(async () => {
	srv = await TestServer.start();
	const auth = await srv.register();
	token = auth.token;
	projectSlug = "batch-proj";
	const proj = await srv.post("/v1/projects", {
		token,
		body: { project_slug: projectSlug, name: "Batch Project" },
	});
	if (proj.status !== 201) throw new Error(`project setup: ${proj.text}`);
});

afterAll(() => srv.stop());

describe("batch upload - happy path", () => {
	test("uploads scripts for multiple devices in one project (auto-creates devices)", async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				message: "batch deploy",
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
					beta: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(201);
		const result = (
			res.body as {
				result: {
					versions: Array<{
						device_id: string;
						version_id: string;
						status: "success" | "created";
						device_rebooted: boolean;
						reboot_reason: string;
					}>;
					message: string | null;
				};
			}
		).result;
		expect(result.message).toBe("batch deploy");
		expect(result.versions.length).toBe(2);
		const byDevice = new Map(result.versions.map((v) => [v.device_id, v]));
		// both were freshly auto-created
		expect(byDevice.get("alpha")?.status).toBe("created");
		expect(byDevice.get("beta")?.status).toBe("created");
		for (const v of result.versions) {
			expect(v.version_id).toBeTruthy();
			expect(v.device_rebooted).toBe(false); // offline
		}

		// each device now resolves via getScript + the version is listed
		const alphaScript = await srv.get(
			`/v1/projects/${projectSlug}/devices/alpha/script`,
			{ token },
		);
		expect(alphaScript.status).toBe(200);
		expect(
			(alphaScript.body as { result: { version_id: string } }).result
				.version_id,
		).toBe(byDevice.get("alpha")?.version_id);
	});

	test('re-uploading to an existing device reports status "success" (not created)', async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(201);
		const versions = (
			res.body as {
				result: { versions: Array<{ device_id: string; status: string }> };
			}
		).result.versions;
		expect(versions[0].device_id).toBe("alpha");
		expect(versions[0].status).toBe("success");
	});
});

describe("batch upload - validation failures (per-item reporting)", () => {
	test("one invalid script among valid ones fails the whole batch atomically (400) with per-device errors", async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					good: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
					// exports Foo but asks for Entry → invalid
					badexport: { script: deviceScriptSource("Foo"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(400);
		const body = res.body as {
			success: boolean;
			error: string;
			errors: Array<{ device_id: string; messages: string[] }>;
		};
		expect(body.success).toBe(false);
		expect(body.error).toContain("Script validation failed");
		// per-device structured detail names the offending device only
		expect(body.errors.length).toBe(1);
		expect(body.errors[0].device_id).toBe("badexport");
		expect(body.errors[0].messages.length).toBeGreaterThan(0);

		// atomic: the valid sibling "good" was NOT persisted
		const goodScript = await srv.get(
			`/v1/projects/${projectSlug}/devices/good/script`,
			{ token },
		);
		expect(goodScript.status).toBe(404);
	});

	test("multiple invalid scripts are all reported", async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					"bad-one": { script: "export class {{{", entrypoint: "Entry" },
					"bad-two": { script: deviceScriptSource("Zzz"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(400);
		const body = res.body as {
			error: string;
			errors: Array<{ device_id: string; messages: string[] }>;
		};
		expect(body.errors.length).toBe(2);
		const ids = body.errors.map((e) => e.device_id).sort();
		expect(ids).toEqual(["bad-one", "bad-two"]);
	});

	test("entrypoint that isn't a valid JS identifier is rejected by the request schema (400)", async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "9bad" },
				},
			},
		});
		expect(res.status).toBe(400);
		expect(res.ok).toBe(false);
	});
});

describe("batch upload - device slug format validation", () => {
	test("an invalid device slug key → 400 before any work", async () => {
		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					// uppercase + starts with digit are both invalid per deviceSlugRegex
					Bad_Slug: {
						script: deviceScriptSource("Entry"),
						entrypoint: "Entry",
					},
				},
			},
		});
		expect(res.status).toBe(400);
		const body = res.body as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("Invalid device_id format");
	});
});

describe("batch upload - project not found", () => {
	test("valid scripts but unknown project → 404", async () => {
		const res = await srv.put(batchPath("no-such-project"), {
			token,
			body: {
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain(
			"Project not found",
		);
	});

	test("validation runs before project lookup: invalid script on unknown project still → 400", async () => {
		const res = await srv.put(batchPath("no-such-project"), {
			token,
			body: {
				devices: {
					alpha: { script: "export class {{{", entrypoint: "Entry" },
				},
			},
		});
		// validation short-circuits with 400 even though the project doesn't exist
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toContain(
			"Script validation failed",
		);
	});

	test("another user's project slug is not visible → 404", async () => {
		const other = await srv.register();
		const res = await srv.put(batchPath(), {
			token: other.token,
			body: {
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(404);
	});

	test("unauthenticated batch upload is rejected", async () => {
		const res = await srv.put(batchPath(), {
			body: {
				devices: {
					alpha: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBeGreaterThanOrEqual(401);
		expect(res.ok).toBe(false);
	});
});

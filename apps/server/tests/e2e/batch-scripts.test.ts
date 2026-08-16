import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { deviceScriptSource, TestServer } from "../harness";

// Batch upload is mounted at PUT /v1/projects/:projectId/scripts and resolves
// :projectId against project_slug. Body shape:
//   { devices: { [deviceSlug]: { script, entrypoint } }, message? }
// Devices are auto-created when they don't already exist (status "created" vs
// "success"). Validation of every script runs BEFORE the project lookup, so a
// validation failure short-circuits with 400 even for a missing project.
// Since the per-device rework, a runtime failure for one device (blob write,
// insert) is isolated: the response is 201 with result.status "partial" and
// per-device error entries instead of an aborted 500.

let srv: TestServer;
let token: string;
let userId: string;
let projectSlug: string;

function batchPath(p = projectSlug): string {
	return `/v1/projects/${p}/scripts`;
}

beforeAll(async () => {
	srv = await TestServer.start();
	const auth = await srv.register();
	token = auth.token;
	userId = auth.user.id;
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
					status: "success" | "partial" | "failed";
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
		expect(result.status).toBe("success");
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

describe("batch upload - partial failures (per-device isolation)", () => {
	test("one device failing to write its blob reports an error result, the rest succeed (partial)", async () => {
		// Make the blob store fail for exactly one device: a directory parked
		// at its `latest.js` key makes the rename in put() fail (EISDIR), so
		// only that device's upload errors out.
		const scriptsRoot = (srv.services.SCRIPTS as unknown as { root: string })
			.root;
		const prefix = `${userId}/${projectSlug}`;
		await srv.services.SCRIPTS.put(`${prefix}/clash/.keep`, "x");
		mkdirSync(join(scriptsRoot, prefix, "clash", "latest.js"));

		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					ok1: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
					clash: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(201);
		const body = res.body as {
			success: boolean;
			result: {
				status: string;
				versions: Array<{
					device_id: string;
					version_id: string;
					status: "success" | "created" | "error";
					error?: string;
					device_rebooted: boolean;
					reboot_reason: string;
				}>;
			};
		};
		expect(body.success).toBe(true);
		expect(body.result.status).toBe("partial");
		const byDevice = new Map(body.result.versions.map((v) => [v.device_id, v]));
		// the healthy device was deployed despite the sibling failure
		expect(byDevice.get("ok1")?.status).toBe("created");
		expect(byDevice.get("ok1")?.version_id).toBeTruthy();
		// the failing device is reported per-device, not as a 500 abort
		expect(byDevice.get("clash")?.status).toBe("error");
		expect(byDevice.get("clash")?.error).toContain("Failed to store script");

		// and the healthy device is actually usable
		const okScript = await srv.get(
			`/v1/projects/${projectSlug}/devices/ok1/script`,
			{ token },
		);
		expect(okScript.status).toBe(200);
	});

	test("every device failing is reported as status 'failed' (not 'partial'), never a bare 500", async () => {
		// Same blob-store conflict as the partial test, but for EVERY device:
		// a directory parked at each `latest.js` key makes the rename in put()
		// fail (EISDIR) for every upload in the batch.
		const scriptsRoot = (srv.services.SCRIPTS as unknown as { root: string })
			.root;
		const prefix = `${userId}/${projectSlug}`;
		for (const slug of ["fail1", "fail2"]) {
			await srv.services.SCRIPTS.put(`${prefix}/${slug}/.keep`, "x");
			mkdirSync(join(scriptsRoot, prefix, slug, "latest.js"));
		}

		const res = await srv.put(batchPath(), {
			token,
			body: {
				devices: {
					fail1: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
					fail2: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
				},
			},
		});
		expect(res.status).toBe(201);
		const body = res.body as {
			success: boolean;
			result: {
				status: "success" | "partial" | "failed";
				versions: Array<{
					device_id: string;
					status: "success" | "created" | "error";
					error?: string;
				}>;
			};
		};
		// total failure is distinguishable from partial failure without
		// scanning the per-device entries
		expect(body.success).toBe(true);
		expect(body.result.status).toBe("failed");
		expect(body.result.versions.length).toBe(2);
		for (const v of body.result.versions) {
			expect(v.status).toBe("error");
			expect(v.error).toContain("Failed to store script");
		}
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

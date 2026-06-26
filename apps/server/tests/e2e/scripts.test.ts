import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { deviceScriptSource, TestServer } from "../harness";

// Routes are mounted at /v1/projects/:projectId/devices/:deviceId/script but the
// handlers resolve :projectId / :deviceId against project_slug / device_slug, so
// throughout these tests we address devices by their slugs (scaffold's projectSlug
// / deviceSlug), not their UUIDs.

let srv: TestServer;
let token: string;
let projectSlug: string;
let deviceSlug: string;

function scriptPath(p = projectSlug, d = deviceSlug): string {
	return `/v1/projects/${p}/devices/${d}/script`;
}

async function uploadVersion(
	message?: string,
): Promise<{ status: number; versionId: string }> {
	const res = await srv.put(scriptPath(), {
		token,
		body: { script: deviceScriptSource("Entry"), entrypoint: "Entry", message },
	});
	const versionId =
		(res.body as { result?: { version_id?: string } })?.result?.version_id ??
		"";
	return { status: res.status, versionId };
}

beforeAll(async () => {
	srv = await TestServer.start();
	const s = await srv.scaffold({
		projectSlug: "scripts-proj",
		deviceSlug: "dev",
	});
	token = s.auth.token;
	projectSlug = s.projectSlug;
	deviceSlug = s.deviceSlug;
});

afterAll(() => srv.stop());

describe("script upload + validation", () => {
	test("uploads a valid script (201, version_id, entrypoint, device_rebooted:false offline)", async () => {
		const res = await srv.put(scriptPath(), {
			token,
			body: {
				script: deviceScriptSource("Entry"),
				entrypoint: "Entry",
				message: "first version",
			},
		});
		expect(res.status).toBe(201);
		const result = (
			res.body as {
				result: {
					version_id: string;
					device_id: string;
					entrypoint: string;
					message: string | null;
					device_rebooted: boolean;
				};
			}
		).result;
		expect(result.version_id).toBeTruthy();
		expect(result.entrypoint).toBe("Entry");
		expect(result.device_id).toBe(deviceSlug);
		expect(result.message).toBe("first version");
		// device is offline → nothing to reboot
		expect(result.device_rebooted).toBe(false);
	});

	test("rejects a script that fails to parse (400)", async () => {
		const res = await srv.put(scriptPath(), {
			token,
			body: { script: "export class {{{", entrypoint: "Entry" },
		});
		expect(res.status).toBe(400);
		const body = res.body as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("Script validation failed");
	});

	test("rejects a script that does not export the named entrypoint (400)", async () => {
		const res = await srv.put(scriptPath(), {
			token,
			// source exports Foo, but we ask for entrypoint Bar
			body: {
				script: deviceScriptSource("Foo"),
				entrypoint: "Bar",
			},
		});
		expect(res.status).toBe(400);
		const body = res.body as { success: boolean; error: string };
		expect(body.success).toBe(false);
		expect(body.error).toContain("Script validation failed");
		expect(body.error).toContain("Bar");
	});

	test("rejects an entrypoint that is not a valid JS identifier (400)", async () => {
		const res = await srv.put(scriptPath(), {
			token,
			body: { script: deviceScriptSource("Entry"), entrypoint: "123abc" },
		});
		// fails Zod regex on the request schema → 400
		expect(res.status).toBe(400);
		expect(res.ok).toBe(false);
	});

	test("accepts a script exporting `default` for any entrypoint name", async () => {
		// validator treats `default` export as a valid entrypoint regardless of name
		const res = await srv.put(scriptPath(), {
			token,
			body: {
				script: "export default class { async onMessage() {} }",
				entrypoint: "Whatever",
			},
		});
		expect(res.status).toBe(201);
	});
});

describe("getScript", () => {
	test("returns the latest deployed script source + current version_id", async () => {
		const up = await uploadVersion("latest-for-get");
		expect(up.status).toBe(201);

		const res = await srv.get(scriptPath(), { token });
		expect(res.status).toBe(200);
		const result = (
			res.body as {
				result: { version_id: string | null; script: string };
			}
		).result;
		expect(result.version_id).toBe(up.versionId);
		expect(result.script).toContain("export class Entry");
	});

	test("404 when no script uploaded for a fresh device", async () => {
		// create a second device with no script
		await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token,
			body: { device_id: "bare", name: "Bare" },
		});
		const res = await srv.get(scriptPath(projectSlug, "bare"), { token });
		expect(res.status).toBe(404);
		expect((res.body as { success: boolean }).success).toBe(false);
	});
});

describe("listVersions + getVersion", () => {
	test("lists versions newest-first with the current flagged", async () => {
		// fresh device so the list is deterministic
		await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token,
			body: { device_id: "listdev", name: "List" },
		});
		const p = scriptPath(projectSlug, "listdev");

		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const r = await srv.put(p, {
				token,
				body: {
					script: deviceScriptSource("Entry"),
					entrypoint: "Entry",
					message: `v${i}`,
				},
			});
			expect(r.status).toBe(201);
			ids.push(
				(r.body as { result: { version_id: string } }).result.version_id,
			);
		}

		const list = await srv.get(`${p}/versions`, { token });
		expect(list.status).toBe(200);
		const versions = (
			list.body as {
				result: Array<{
					version_id: string;
					message: string | null;
					is_current: boolean;
					created_at: number;
				}>;
			}
		).result;
		expect(versions.length).toBe(3);
		// newest-first: the last uploaded version is index 0 and is current
		expect(versions[0].version_id).toBe(ids[2]);
		expect(versions[0].is_current).toBe(true);
		expect(versions[1].is_current).toBe(false);
		expect(versions[2].is_current).toBe(false);
		// created_at sorted descending (or equal - uploads can share a ms)
		expect(versions[0].created_at).toBeGreaterThanOrEqual(
			versions[2].created_at,
		);
		// exactly one current
		expect(versions.filter((v) => v.is_current).length).toBe(1);
	});

	test("getVersion returns the content for a known id (200) and 404 for unknown", async () => {
		const up = await uploadVersion("for-getversion");
		expect(up.status).toBe(201);

		const ok = await srv.get(`${scriptPath()}/versions/${up.versionId}`, {
			token,
		});
		expect(ok.status).toBe(200);
		const result = (
			ok.body as {
				result: { version_id: string; message: string | null; script: string };
			}
		).result;
		expect(result.version_id).toBe(up.versionId);
		expect(result.message).toBe("for-getversion");
		expect(result.script).toContain("export class Entry");

		const missing = await srv.get(
			`${scriptPath()}/versions/${crypto.randomUUID()}`,
			{ token },
		);
		expect(missing.status).toBe(404);
	});
});

describe("deployVersion (rollback)", () => {
	test("deploying an older version flips current_version_id back", async () => {
		await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token,
			body: { device_id: "deploydev", name: "Deploy" },
		});
		const p = scriptPath(projectSlug, "deploydev");

		const v1 = await srv.put(p, {
			token,
			body: {
				script: deviceScriptSource("Entry"),
				entrypoint: "Entry",
				message: "v1",
			},
		});
		const v2 = await srv.put(p, {
			token,
			body: {
				script: deviceScriptSource("Entry"),
				entrypoint: "Entry",
				message: "v2",
			},
		});
		const v1Id = (v1.body as { result: { version_id: string } }).result
			.version_id;
		const v2Id = (v2.body as { result: { version_id: string } }).result
			.version_id;

		// currently v2 is the deployed one
		const before = await srv.get(p, { token });
		expect(
			(before.body as { result: { version_id: string } }).result.version_id,
		).toBe(v2Id);

		// roll back to v1
		const deploy = await srv.post(`${p}/versions/${v1Id}/deploy`, { token });
		expect(deploy.status).toBe(200);
		const dr = (
			deploy.body as {
				result: { version_id: string; device_rebooted: boolean };
			}
		).result;
		expect(dr.version_id).toBe(v1Id);
		expect(dr.device_rebooted).toBe(false); // offline

		// getScript now reflects v1 as current
		const after = await srv.get(p, { token });
		expect(
			(after.body as { result: { version_id: string } }).result.version_id,
		).toBe(v1Id);

		// list confirms v1 is current, v2 no longer current
		const list = await srv.get(`${p}/versions`, { token });
		const versions = (
			list.body as {
				result: Array<{ version_id: string; is_current: boolean }>;
			}
		).result;
		expect(versions.find((v) => v.version_id === v1Id)?.is_current).toBe(true);
		expect(versions.find((v) => v.version_id === v2Id)?.is_current).toBe(false);
	});

	test("deploying an unknown version → 404", async () => {
		const res = await srv.post(
			`${scriptPath()}/versions/${crypto.randomUUID()}/deploy`,
			{ token },
		);
		expect(res.status).toBe(404);
		expect((res.body as { success: boolean }).success).toBe(false);
	});
});

describe("script-version pruning (FIFO, maxScriptVersionsPerDevice=20)", () => {
	test("uploading 22 versions caps the stored list at 20 (oldest pruned)", async () => {
		await srv.post(`/v1/projects/${projectSlug}/devices`, {
			token,
			body: { device_id: "prunedev", name: "Prune" },
		});
		const p = scriptPath(projectSlug, "prunedev");

		const ids: string[] = [];
		for (let i = 0; i < 22; i++) {
			const r = await srv.put(p, {
				token,
				body: {
					script: deviceScriptSource("Entry"),
					entrypoint: "Entry",
					message: `prune-${i}`,
				},
			});
			expect(r.status).toBe(201);
			ids.push(
				(r.body as { result: { version_id: string } }).result.version_id,
			);
		}

		const list = await srv.get(`${p}/versions`, { token });
		expect(list.status).toBe(200);
		const versions = (
			list.body as {
				result: Array<{ version_id: string; is_current: boolean }>;
			}
		).result;
		// capped at the limit
		expect(versions.length).toBe(20);
		// the newest (current) version survives and is flagged current
		expect(versions[0].version_id).toBe(ids[21]);
		expect(versions[0].is_current).toBe(true);
		// the two oldest were pruned FIFO
		const survivingIds = new Set(versions.map((v) => v.version_id));
		expect(survivingIds.has(ids[0])).toBe(false);
		expect(survivingIds.has(ids[1])).toBe(false);
		// a pruned version's file is gone too → getVersion 404
		const gone = await srv.get(`${p}/versions/${ids[0]}`, { token });
		expect(gone.status).toBe(404);
		// the surviving second-oldest is still fetchable
		const stillThere = await srv.get(`${p}/versions/${ids[2]}`, { token });
		expect(stillThere.status).toBe(200);
	});
});

describe("not-found handling for unknown project/device", () => {
	test("upload to unknown project → 404", async () => {
		const res = await srv.put(scriptPath("no-such-project", deviceSlug), {
			token,
			body: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain(
			"Project not found",
		);
	});

	test("upload to unknown device → 404", async () => {
		const res = await srv.put(scriptPath(projectSlug, "no-such-device"), {
			token,
			body: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toContain("Device not found");
	});

	test("listVersions on unknown project → 404", async () => {
		const res = await srv.get(
			`/v1/projects/no-such-project/devices/${deviceSlug}/script/versions`,
			{ token },
		);
		expect(res.status).toBe(404);
	});

	test("listVersions on unknown device → 404", async () => {
		const res = await srv.get(
			`/v1/projects/${projectSlug}/devices/no-such-device/script/versions`,
			{ token },
		);
		expect(res.status).toBe(404);
	});

	test("another user cannot read this project's scripts (project scoped by user) → 404", async () => {
		const other = await srv.register();
		const res = await srv.get(scriptPath(), { token: other.token });
		// project lookup is keyed on user_id → not found for a different user
		expect(res.status).toBe(404);
	});

	test("unauthenticated upload is rejected", async () => {
		const res = await srv.put(scriptPath(), {
			body: { script: deviceScriptSource("Entry"), entrypoint: "Entry" },
		});
		expect(res.status).toBeGreaterThanOrEqual(401);
		expect(res.ok).toBe(false);
	});
});

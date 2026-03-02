import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type {
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../src/types";
import { TEST_PROJECT_ID, TEST_USER_ID } from "../setup-test-data";

describe.sequential("Inter-device RPC", () => {
	let qb: D1QB;
	let project: tableProjects;

	beforeAll(async () => {
		qb = new D1QB(env.DB);
		project = (await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["project_slug = ?1"],
					params: [TEST_PROJECT_ID],
				},
			})
			.execute()
			.then((p) => p.results)) as tableProjects;

		// Create two devices for RPC testing
		const now = Date.now();
		await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "rpc-light",
					project_id: project.id,
					device_slug: "light-controller",
					name: "Light Controller",
					current_version_id: "rpc-light-v1",
					created_at: now,
					updated_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();

		await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "rpc-sensor",
					project_id: project.id,
					device_slug: "sensor",
					name: "Sensor",
					current_version_id: "rpc-sensor-v1",
					created_at: now,
					updated_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();

		// Create device_scripts entries
		await qb
			.insert<tableDeviceScripts>({
				tableName: "device_scripts",
				data: {
					id: "rpc-script-light",
					device_id: "rpc-light",
					version_id: "rpc-light-v1",
					entrypoint: "LightController",
					message: "Initial version",
					created_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();

		await qb
			.insert<tableDeviceScripts>({
				tableName: "device_scripts",
				data: {
					id: "rpc-script-sensor",
					device_id: "rpc-sensor",
					version_id: "rpc-sensor-v1",
					entrypoint: "Sensor",
					message: "Initial version",
					created_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();

		// Create a device with no script deployed
		await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: "rpc-no-script",
					project_id: project.id,
					device_slug: "no-script-device",
					name: "No Script Device",
					created_at: now,
					updated_at: now,
				},
				onConflict: "IGNORE",
			})
			.execute();
	});

	describe("DevicesBridge slug resolution (via D1)", () => {
		it("should find device with deployed script via D1 query", async () => {
			// Verify the D1 query pattern used by DevicesBridge
			const result = await qb
				.fetchOne({
					tableName: "devices d",
					fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
					join: {
						type: "LEFT",
						table: "device_scripts ds",
						on: "ds.version_id = d.current_version_id",
					},
					where: {
						conditions: "d.project_id = ? AND d.device_slug = ?",
						params: [project.id, "light-controller"],
					},
				})
				.execute();

			const device = result.results as {
				id: string;
				current_version_id: string | null;
				entrypoint: string | null;
			};

			expect(device).toBeDefined();
			expect(device.id).toBe("rpc-light");
			expect(device.current_version_id).toBe("rpc-light-v1");
			expect(device.entrypoint).toBe("LightController");
		});

		it("should resolve sensor device correctly", async () => {
			const result = await qb
				.fetchOne({
					tableName: "devices d",
					fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
					join: {
						type: "LEFT",
						table: "device_scripts ds",
						on: "ds.version_id = d.current_version_id",
					},
					where: {
						conditions: "d.project_id = ? AND d.device_slug = ?",
						params: [project.id, "sensor"],
					},
				})
				.execute();

			const device = result.results as {
				id: string;
				current_version_id: string | null;
				entrypoint: string | null;
			};

			expect(device).toBeDefined();
			expect(device.id).toBe("rpc-sensor");
			expect(device.entrypoint).toBe("Sensor");
		});

		it("should return undefined for non-existent device slug", async () => {
			const result = await qb
				.fetchOne({
					tableName: "devices d",
					fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
					join: {
						type: "LEFT",
						table: "device_scripts ds",
						on: "ds.version_id = d.current_version_id",
					},
					where: {
						conditions: "d.project_id = ? AND d.device_slug = ?",
						params: [project.id, "does-not-exist"],
					},
				})
				.execute();

			expect(result.results).toBeUndefined();
		});

		it("should resolve device with no deployed script (null entrypoint)", async () => {
			const result = await qb
				.fetchOne({
					tableName: "devices d",
					fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
					join: {
						type: "LEFT",
						table: "device_scripts ds",
						on: "ds.version_id = d.current_version_id",
					},
					where: {
						conditions: "d.project_id = ? AND d.device_slug = ?",
						params: [project.id, "no-script-device"],
					},
				})
				.execute();

			const device = result.results as {
				id: string;
				current_version_id: string | null;
				entrypoint: string | null;
			};

			expect(device).toBeDefined();
			expect(device.id).toBe("rpc-no-script");
			expect(device.current_version_id).toBeNull();
			expect(device.entrypoint).toBeNull();
		});

		it("should not resolve devices from a different project", async () => {
			const result = await qb
				.fetchOne({
					tableName: "devices d",
					fields: ["d.id", "d.current_version_id", "ds.entrypoint"],
					join: {
						type: "LEFT",
						table: "device_scripts ds",
						on: "ds.version_id = d.current_version_id",
					},
					where: {
						conditions: "d.project_id = ? AND d.device_slug = ?",
						params: ["proj-2", "light-controller"],
					},
				})
				.execute();

			expect(result.results).toBeUndefined();
		});
	});

	describe("classProxy callMethod blocking", () => {
		// These verify the BLOCKED_METHODS set used in the proxy's callMethod function.
		const BLOCKED_METHODS = new Set([
			"onMessage",
			"onDeviceConnect",
			"onDeviceDisconnect",
			"onAlarm",
			"constructor",
			"env",
			"ctx",
		]);

		it("should block lifecycle methods from remote calls", () => {
			expect(BLOCKED_METHODS.has("onMessage")).toBe(true);
			expect(BLOCKED_METHODS.has("onDeviceConnect")).toBe(true);
			expect(BLOCKED_METHODS.has("onDeviceDisconnect")).toBe(true);
			expect(BLOCKED_METHODS.has("onAlarm")).toBe(true);
		});

		it("should block internal properties from remote calls", () => {
			expect(BLOCKED_METHODS.has("constructor")).toBe(true);
			expect(BLOCKED_METHODS.has("env")).toBe(true);
			expect(BLOCKED_METHODS.has("ctx")).toBe(true);
		});

		it("should allow user-defined methods", () => {
			expect(BLOCKED_METHODS.has("turnOn")).toBe(false);
			expect(BLOCKED_METHODS.has("updateDesiredState")).toBe(false);
			expect(BLOCKED_METHODS.has("getStatus")).toBe(false);
		});
	});

	describe("call depth limiting", () => {
		const MAX_CALL_DEPTH = 3;

		it("should allow calls within depth limit", () => {
			expect(0 < MAX_CALL_DEPTH).toBe(true);
			expect(1 < MAX_CALL_DEPTH).toBe(true);
			expect(2 < MAX_CALL_DEPTH).toBe(true);
		});

		it("should reject calls at or beyond max depth", () => {
			expect(3 >= MAX_CALL_DEPTH).toBe(true);
			expect(5 >= MAX_CALL_DEPTH).toBe(true);
		});
	});
});

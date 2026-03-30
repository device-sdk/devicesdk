import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1QB } from "workers-qb";
import type {
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../src/types";
import { TEST_PROJECT_ID } from "../setup-test-data";

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

	describe("RPC constants", () => {
		it("should have expected blocked methods", async () => {
			const { BLOCKED_METHODS } = await import(
				"../../src/durableObjects/lib/rpcConstants"
			);
			expect(BLOCKED_METHODS).toContain("onMessage");
			expect(BLOCKED_METHODS).toContain("onDeviceConnect");
			expect(BLOCKED_METHODS).toContain("onDeviceDisconnect");
			expect(BLOCKED_METHODS).toContain("onAlarm");
			expect(BLOCKED_METHODS).toContain("constructor");
			expect(BLOCKED_METHODS).toContain("env");
			expect(BLOCKED_METHODS).toContain("ctx");
		});

		it("should block getCrons and onCron from remote calls", async () => {
			const { BLOCKED_METHODS } = await import(
				"../../src/durableObjects/lib/rpcConstants"
			);
			expect(BLOCKED_METHODS).toContain("getCrons");
			expect(BLOCKED_METHODS).toContain("onCron");
		});

		it("should have at least 9 blocked methods", async () => {
			const { BLOCKED_METHODS } = await import(
				"../../src/durableObjects/lib/rpcConstants"
			);
			// 7 original + getCrons + onCron = 9
			expect(BLOCKED_METHODS.length).toBeGreaterThanOrEqual(9);
		});

		it("should not block user-defined method names", async () => {
			const { BLOCKED_METHODS } = await import(
				"../../src/durableObjects/lib/rpcConstants"
			);
			const blocked = new Set<string>(BLOCKED_METHODS);
			expect(blocked.has("turnOn")).toBe(false);
			expect(blocked.has("updateDesiredState")).toBe(false);
			expect(blocked.has("getStatus")).toBe(false);
		});

		it("should have max call depth of 3", async () => {
			const { MAX_CALL_DEPTH } = await import(
				"../../src/durableObjects/lib/rpcConstants"
			);
			expect(MAX_CALL_DEPTH).toBe(3);
		});
	});

	describe("classProxy generated code", () => {
		it("should include BLOCKED_METHODS in generated proxy", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			const code = getProxyEntrypoint("TestDevice");
			expect(code).toContain("BLOCKED_METHODS");
			expect(code).toContain("onMessage");
			expect(code).toContain("callMethod");
		});

		it("should strip internal bindings from user env in generated proxy", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			const code = getProxyEntrypoint("TestDevice");
			expect(code).toContain("__DEVICE_BRIDGE: bridge");
			expect(code).toContain("publicEnv");
			expect(code).toContain(
				"Object.assign({}, publicEnv, { DEVICE: safeDevice, DEVICES: devicesProxy, VARS })",
			);
		});

		it("should check user class prototype in callMethod", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			const code = getProxyEntrypoint("TestDevice");
			expect(code).toContain("Object.getPrototypeOf(target)");
			expect(code).toContain("hasOwnProperty");
		});
	});

	describe("classProxy security", () => {
		it("should reject invalid entrypoint names", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			expect(() => getProxyEntrypoint("x}; class x{")).toThrow(
				"Invalid entrypoint name",
			);
			expect(() => getProxyEntrypoint("My Device")).toThrow(
				"Invalid entrypoint name",
			);
			expect(() => getProxyEntrypoint("")).toThrow("Invalid entrypoint name");
		});

		it("should accept valid entrypoint names", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			expect(() => getProxyEntrypoint("Device")).not.toThrow();
			expect(() => getProxyEntrypoint("MyDevice_v2")).not.toThrow();
			expect(() => getProxyEntrypoint("$Device")).not.toThrow();
			expect(() => getProxyEntrypoint("_Private")).not.toThrow();
		});

		it("should save and restore env in callMethod", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			const code = getProxyEntrypoint("TestDevice");
			expect(code).toContain("const originalEnv = target.env");
			expect(code).toContain("finally { target.env = originalEnv; }");
		});

		it("should include DEVICE method allowlist", async () => {
			const { getProxyEntrypoint } = await import(
				"../../src/durableObjects/lib/classProxy"
			);
			const code = getProxyEntrypoint("TestDevice");
			expect(code).toContain("ALLOWED_DEVICE_METHODS");
			expect(code).toContain("safeDevice");
			expect(code).toContain("'sendCommand'");
			expect(code).toContain("'sendCommandAndWait'");
			expect(code).toContain("'persistLog'");
		});
	});
});

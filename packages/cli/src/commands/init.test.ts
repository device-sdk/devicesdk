import fs from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import init from "./init.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const apiMocks = {
	createProject: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		createProject: (...args: any[]) => apiMocks.createProject(...args),
	};
});

const execaMock = vi.fn().mockResolvedValue({});
vi.mock("execa", () => ({
	execa: (...args: any[]) => execaMock(...args),
}));

describe("init command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	const accessSpy = vi.spyOn(fs, "access");
	const mkdirSpy = vi.spyOn(fs, "mkdir");
	const writeFileSpy = vi.spyOn(fs, "writeFile");

	beforeEach(() => {
		vi.clearAllMocks();
		apiMocks.createProject.mockResolvedValue({});
		execaMock.mockResolvedValue({});
		// Default: all files don't exist (access throws ENOENT)
		accessSpy.mockRejectedValue(
			Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
		);
		mkdirSpy.mockResolvedValue(undefined);
		writeFileSpy.mockResolvedValue(undefined);
	});

	it("exits with code 2 for an unknown template", async () => {
		await expect(init(undefined, { template: "nonexistent" })).rejects.toThrow(
			/exit:2/,
		);
		expect(exitSpy).toHaveBeenCalledWith(2);
	});

	it("exits with code 1 when devicesdk.ts already exists", async () => {
		// devicesdk.ts access resolves → file exists
		accessSpy.mockResolvedValueOnce(undefined);

		await expect(init()).rejects.toThrow(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("creates all project files successfully with the basic template", async () => {
		await init();

		expect(apiMocks.createProject).toHaveBeenCalledWith(
			"test-token",
			"my-project",
		);

		const written = writeFileSpy.mock.calls.map(([p]) => String(p));
		expect(written.some((p) => p.endsWith("devicesdk.ts"))).toBe(true);
		expect(written.some((p) => p.endsWith("package.json"))).toBe(true);
		expect(written.some((p) => p.endsWith("tsconfig.json"))).toBe(true);
		expect(written.some((p) => p.endsWith(".gitignore"))).toBe(true);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("uses the provided project name as the project ID and directory", async () => {
		await init("my-app");

		expect(apiMocks.createProject).toHaveBeenCalledWith("test-token", "my-app");
		expect(mkdirSpy).toHaveBeenCalledWith(
			expect.stringContaining("my-app"),
			expect.objectContaining({ recursive: true }),
		);
	});

	it("handles 409 conflict gracefully when project already exists on server", async () => {
		apiMocks.createProject.mockRejectedValueOnce(
			new DeviceSDKApiError("Conflict", 409),
		);

		await init();

		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("exits with code 1 when createProject fails with a non-409 error", async () => {
		apiMocks.createProject.mockRejectedValueOnce(
			new DeviceSDKApiError("Server Error", 500),
		);

		await expect(init()).rejects.toThrow(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("does not overwrite an existing package.json", async () => {
		// Use path-discriminating implementation to avoid coupling to call order
		accessSpy.mockImplementation(async (p: Parameters<typeof fs.access>[0]) => {
			if (String(p).endsWith("package.json")) return undefined; // package.json exists
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		await init();

		const written = writeFileSpy.mock.calls.map(([p]) => String(p));
		expect(written.some((p) => p.endsWith("package.json"))).toBe(false);
		expect(written.some((p) => p.endsWith("devicesdk.ts"))).toBe(true);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("skips git init when the noGit option is set", async () => {
		await init(undefined, { noGit: true });

		expect(execaMock).not.toHaveBeenCalledWith(
			"git",
			expect.anything(),
			expect.anything(),
		);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("skips git init when a .git directory already exists", async () => {
		accessSpy.mockImplementation(async (p: Parameters<typeof fs.access>[0]) => {
			if (String(p).endsWith(".git")) return undefined; // .git exists
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		});

		await init();

		expect(execaMock).not.toHaveBeenCalledWith(
			"git",
			["init"],
			expect.anything(),
		);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("generates device source files for the basic template", async () => {
		await init();

		const written = writeFileSpy.mock.calls.map(([p]) => String(p));
		// Basic template has one device at ./src/devices/device.ts
		expect(
			written.some((p) => p.endsWith("device.ts") && p.includes("devices")),
		).toBe(true);
	});

	it("generates no device source files for the empty template", async () => {
		await init(undefined, { template: "empty" });

		const written = writeFileSpy.mock.calls.map(([p]) => String(p));
		// Empty template has no devices → no src/devices/*.ts files
		expect(written.some((p) => p.includes("src/devices"))).toBe(false);
		expect(exitSpy).not.toHaveBeenCalled();
	});
});

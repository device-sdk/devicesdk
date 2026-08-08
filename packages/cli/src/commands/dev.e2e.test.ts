import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dev, { removeDevFiles } from "./dev";

describe("dev command e2e", () => {
	// biome-ignore lint: test helper
	let consoleErrorSpy: any;
	// biome-ignore lint: test helper
	let processExitSpy: any;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should exit with error when no config file exists", async () => {
		// dev({}) resolves CWD (a directory), then loadConfig fails to find devicesdk.ts
		// loadConfig calls process.exit(4) which our mock throws
		// The error is caught by dev()'s outer try-catch, so dev() resolves
		await dev({});

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Config file not found"),
		);
		expect(processExitSpy).toHaveBeenCalledWith(4);
	});

	it("removeDevFiles deletes only dev's own files, never the shared .devicesdk state", async () => {
		const tmpRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "devicesdk-cleanup-test-"),
		);
		const tmpDir = path.join(tmpRoot, ".devicesdk");
		const buildDir = path.join(tmpDir, "build");
		const configsDir = path.join(buildDir, "configs");
		const firmwareDir = path.join(tmpDir, "firmware");
		await fs.mkdir(configsDir, { recursive: true });
		await fs.mkdir(firmwareDir, { recursive: true });
		await fs.writeFile(path.join(tmpDir, "bundle.js"), "x");
		await fs.writeFile(path.join(tmpDir, "config.capnp"), "x");
		await fs.writeFile(path.join(tmpDir, "simulator.js"), "x");
		await fs.writeFile(path.join(tmpDir, "_workerd_entry.ts"), "x");
		// build/deploy/flash state must survive dev shutdown
		await fs.writeFile(path.join(buildDir, "sensor-1.js"), "x");
		await fs.writeFile(path.join(configsDir, "config.mjs"), "x");
		await fs.writeFile(path.join(firmwareDir, "sensor-1.uf2"), "x");

		await removeDevFiles(tmpDir);

		for (const devFile of [
			"bundle.js",
			"config.capnp",
			"simulator.js",
			"_workerd_entry.ts",
		]) {
			await expect(fs.access(path.join(tmpDir, devFile))).rejects.toThrow();
		}
		// The dir itself and the other commands' state are untouched.
		await expect(fs.access(tmpDir)).resolves.toBeUndefined();
		await expect(
			fs.access(path.join(buildDir, "sensor-1.js")),
		).resolves.toBeUndefined();
		await expect(
			fs.access(path.join(configsDir, "config.mjs")),
		).resolves.toBeUndefined();
		await expect(
			fs.access(path.join(firmwareDir, "sensor-1.uf2")),
		).resolves.toBeUndefined();

		await fs.rm(tmpRoot, { recursive: true, force: true });
	});
});

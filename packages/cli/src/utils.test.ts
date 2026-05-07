import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConfigDir } from "./utils";

describe("getConfigDir", () => {
	const originalEnv = process.env.DEVICESDK_CONFIG;

	beforeEach(() => {
		delete process.env.DEVICESDK_CONFIG;
	});

	afterEach(() => {
		if (originalEnv !== undefined) {
			process.env.DEVICESDK_CONFIG = originalEnv;
		} else {
			delete process.env.DEVICESDK_CONFIG;
		}
	});

	it("should return dirname when configPath ends with .ts", () => {
		const configPath = "/some/project/devicesdk.ts";
		const result = getConfigDir(configPath);
		expect(result).toBe("/some/project");
	});

	it("should return the resolved path when configPath is a directory", () => {
		const configPath = "/some/project";
		const result = getConfigDir(configPath);
		expect(result).toBe("/some/project");
	});

	it("should use DEVICESDK_CONFIG env var when no configPath is provided", () => {
		process.env.DEVICESDK_CONFIG = "/env/path/devicesdk.ts";
		const result = getConfigDir();
		expect(result).toBe("/env/path");
	});

	it("should use DEVICESDK_CONFIG env var directory when it does not end with .ts", () => {
		process.env.DEVICESDK_CONFIG = "/env/project";
		const result = getConfigDir();
		expect(result).toBe("/env/project");
	});

	it("should fall back to cwd when no configPath and no env var", () => {
		const result = getConfigDir();
		expect(result).toBe(process.cwd());
	});

	it("should prefer explicit configPath over DEVICESDK_CONFIG env var", () => {
		process.env.DEVICESDK_CONFIG = "/env/path/devicesdk.ts";
		const result = getConfigDir("/explicit/devicesdk.ts");
		expect(result).toBe("/explicit");
	});

	it("should resolve a relative .ts configPath against cwd", () => {
		const result = getConfigDir("myproject/devicesdk.ts");
		expect(result).toBe(path.resolve(process.cwd(), "myproject"));
	});

	it("should resolve a relative directory configPath against cwd", () => {
		const result = getConfigDir("myproject");
		expect(result).toBe(path.resolve(process.cwd(), "myproject"));
	});

	describe("parent-walk discovery", () => {
		const originalCwd = process.cwd();
		let tmpRoot: string;

		beforeEach(async () => {
			tmpRoot = await fs.mkdtemp(
				path.join(os.tmpdir(), "devicesdk-utils-test-"),
			);
		});

		afterEach(async () => {
			process.chdir(originalCwd);
			await fs.rm(tmpRoot, { recursive: true, force: true });
		});

		it("walks up from a sub-directory to find devicesdk.ts", async () => {
			const projectDir = path.join(tmpRoot, "project");
			const subDir = path.join(projectDir, "src", "deep");
			await fs.mkdir(subDir, { recursive: true });
			await fs.writeFile(path.join(projectDir, "devicesdk.ts"), "// test");

			process.chdir(subDir);
			expect(getConfigDir()).toBe(await fs.realpath(projectDir));
		});

		it("falls back to cwd when no devicesdk.ts is found", async () => {
			const lonelyDir = path.join(tmpRoot, "no-config");
			await fs.mkdir(lonelyDir, { recursive: true });
			process.chdir(lonelyDir);
			expect(getConfigDir()).toBe(await fs.realpath(lonelyDir));
		});

		it("does not walk up when --config / DEVICESDK_CONFIG is set", async () => {
			const explicit = path.join(tmpRoot, "explicit", "devicesdk.ts");
			await fs.mkdir(path.dirname(explicit), { recursive: true });
			await fs.writeFile(explicit, "// test");

			const cwdDir = path.join(tmpRoot, "elsewhere");
			await fs.mkdir(cwdDir, { recursive: true });
			process.chdir(cwdDir);

			expect(getConfigDir(explicit)).toBe(path.dirname(explicit));
		});
	});
});

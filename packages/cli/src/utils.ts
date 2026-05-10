import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { ZodError, type z } from "zod";
import { type DeviceSDKConfig, DeviceSDKConfigSchema } from "./config.js";
import { EXIT } from "./exitCodes.js";
import { emitJsonError, isJsonMode } from "./output.js";

const CONFIG_FILENAME = "devicesdk.ts";

// If we find one of these at a given level *without* a `devicesdk.ts`, we
// treat it as a foreign-project boundary and stop walking. This avoids binding
// to a `devicesdk.ts` higher up when the user happens to be running inside an
// unrelated repository checkout.
const PROJECT_BOUNDARY_MARKERS = [".git", "package.json"];

function findConfigUp(startDir: string): string | null {
	const home = os.homedir();
	let current = path.resolve(startDir);
	while (true) {
		const candidate = path.join(current, CONFIG_FILENAME);
		if (existsSync(candidate)) {
			return candidate;
		}
		for (const marker of PROJECT_BOUNDARY_MARKERS) {
			if (existsSync(path.join(current, marker))) return null;
		}
		const parent = path.dirname(current);
		if (parent === current) return null;
		// Belt-and-suspenders: never walk above the user's home directory tree.
		if (current === home) return null;
		current = parent;
	}
}

function resolveConfigPath(configPath?: string): string {
	const override = configPath || process.env.DEVICESDK_CONFIG;
	if (override) {
		let resolved = path.resolve(process.cwd(), override);
		if (!resolved.endsWith(".ts")) {
			resolved = path.join(resolved, CONFIG_FILENAME);
		}
		return resolved;
	}
	const found = findConfigUp(process.cwd());
	if (found) return found;
	return path.join(process.cwd(), CONFIG_FILENAME);
}

export async function loadConfig(
	configPath?: string,
): Promise<DeviceSDKConfig> {
	const resolvedPath = resolveConfigPath(configPath);
	// Honour DEVICESDK_OUTPUT=json so JSON consumers (the MCP server, agents,
	// scripts) get a parseable failure rather than stderr noise + empty stdout.
	const json = isJsonMode();
	const docs = "https://devicesdk.com/docs/cli/init/";

	try {
		await fs.access(resolvedPath);
	} catch {
		if (json) {
			emitJsonError(
				`Config file not found at ${resolvedPath}. Run \`devicesdk init\` to create a new project.`,
				{ code: "config_not_found", docs },
			);
		} else {
			console.error(`✗ Error: Config file not found\n`);
			console.error(`  Expected: ${resolvedPath}`);
			console.error(`  Run \`devicesdk init\` to create a new project.`);
		}
		process.exit(EXIT.CONFIG_LOAD_FAILED);
	}

	try {
		let configUrl: string;

		// If it's a TypeScript file, compile it first
		if (resolvedPath.endsWith(".ts")) {
			const result = await esbuild.build({
				entryPoints: [resolvedPath],
				bundle: false,
				format: "esm",
				target: "es2022",
				write: false,
				platform: "node",
			});

			const code = result.outputFiles[0].text;
			const configDir = path.dirname(resolvedPath);
			const tempDir = path.join(configDir, ".devicesdk", "build", "configs");
			await fs.mkdir(tempDir, { recursive: true });
			const tempFile = path.join(tempDir, "config.mjs");
			await fs.writeFile(tempFile, code);
			configUrl = pathToFileURL(tempFile).href;
		} else {
			configUrl = pathToFileURL(resolvedPath).href;
		}

		const module = await import(configUrl);
		const config = module.default || module.config;
		return DeviceSDKConfigSchema.parse(config);
	} catch (error) {
		if (error instanceof ZodError) {
			if (json) {
				const issues = error.issues
					.map(
						(issue: z.ZodIssue) => `${issue.path.join(".")}: ${issue.message}`,
					)
					.join("; ");
				emitJsonError(`Invalid configuration in ${resolvedPath}: ${issues}`, {
					code: "config_invalid",
					docs,
				});
			} else {
				console.error(`✗ Error: Invalid configuration in ${resolvedPath}\n`);
				error.issues.forEach((issue: z.ZodIssue) => {
					console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
				});
			}
			process.exit(EXIT.CONFIG_LOAD_FAILED);
		}
		const msg =
			error instanceof Error ? error.message : "Could not load config file";
		if (json) {
			emitJsonError(`Could not load config file: ${msg}`, {
				code: "config_load_failed",
				docs,
			});
		} else {
			console.error(`✗ Error: Could not load config file\n`);
			console.error(`  ${msg}`);
		}
		process.exit(EXIT.CONFIG_LOAD_FAILED);
	}

	// This should never be reached but TypeScript needs it
	throw new Error("Unreachable");
}

export function getConfigDir(configPath?: string): string {
	return path.dirname(resolveConfigPath(configPath));
}

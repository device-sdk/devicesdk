import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { ZodError, type z } from "zod";
import { type DeviceSDKConfig, DeviceSDKConfigSchema } from "./config.js";

export async function loadConfig(
	configPath?: string,
): Promise<DeviceSDKConfig> {
	const configOption = configPath || process.env.DEVICESDK_CONFIG || ".";
	let resolvedPath = path.resolve(process.cwd(), configOption);

	try {
		const stats = await fs.stat(resolvedPath);
		if (stats.isDirectory()) {
			resolvedPath = path.join(resolvedPath, "devicesdk.ts");
		}
	} catch {
		// Try adding devicesdk.ts if it's a directory path
		if (!resolvedPath.endsWith(".ts")) {
			resolvedPath = path.join(resolvedPath, "devicesdk.ts");
		}
	}

	// Check if file exists
	try {
		await fs.access(resolvedPath);
	} catch {
		console.error(`✗ Error: Config file not found\n`);
		console.error(`  Expected: ${resolvedPath}`);
		console.error(`  Run \`devicesdk init\` to create a new project.`);
		process.exit(4);
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
			console.error(`✗ Error: Invalid configuration in ${resolvedPath}\n`);
			error.issues.forEach((issue: z.ZodIssue) => {
				console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
			});
			process.exit(4);
		}
		console.error(`✗ Error: Could not load config file\n`);
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(4);
	}

	// This should never be reached but TypeScript needs it
	throw new Error("Unreachable");
}

export function getConfigDir(configPath?: string): string {
	const configOption = configPath || process.env.DEVICESDK_CONFIG || ".";
	const resolvedPath = path.resolve(process.cwd(), configOption);

	if (resolvedPath.endsWith(".ts")) {
		return path.dirname(resolvedPath);
	}
	return resolvedPath;
}

import { ENV_VAR_KEY_REGEX } from "@devicesdk/core";
import {
	DeviceSDKApiError,
	deleteEnvVar,
	listEnvVars,
	setEnvVars,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import { loadConfig } from "../utils.js";

interface EnvOptions {
	project?: string;
	config?: string;
}

async function resolveProjectId(options: EnvOptions): Promise<string> {
	if (options.project) {
		return options.project;
	}
	const config = await loadConfig(options.config);
	return config.projectId;
}

export async function envSet(
	pairs: string[],
	options: EnvOptions,
): Promise<void> {
	try {
		if (pairs.length === 0) {
			console.error("✗ Provide at least one KEY=VALUE pair.");
			process.exit(EXIT.GENERIC);
		}

		const vars: Record<string, string> = {};
		for (const pair of pairs) {
			const eqIdx = pair.indexOf("=");
			if (eqIdx === -1) {
				console.error(`✗ Invalid format "${pair}". Expected KEY=VALUE.`);
				process.exit(EXIT.GENERIC);
			}
			const key = pair.slice(0, eqIdx);
			const value = pair.slice(eqIdx + 1);

			if (!ENV_VAR_KEY_REGEX.test(key)) {
				console.error(
					`✗ Invalid key "${key}". Keys must be uppercase letters, digits, and underscores, starting with a letter (max 64 chars).`,
				);
				process.exit(EXIT.GENERIC);
			}

			vars[key] = value;
		}

		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		const result = await setEnvVars(token, projectId, vars);
		const count = result.count;
		console.log(
			`✓ Set ${count} env var${count !== 1 ? "s" : ""} for project "${projectId}".`,
		);
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

export async function envList(options: EnvOptions): Promise<void> {
	try {
		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		const vars = await listEnvVars(token, projectId);

		if (vars.length === 0) {
			console.log(`No env vars set for project "${projectId}".`);
			return;
		}

		const maxKeyLen = Math.max(3, ...vars.map((v) => v.key.length));
		const header = `${"KEY".padEnd(maxKeyLen)}  UPDATED AT`;
		const divider = "-".repeat(header.length);

		console.log(`Project: ${projectId}\n`);
		console.log(header);
		console.log(divider);

		for (const v of vars) {
			const date = new Date(v.updated_at)
				.toISOString()
				.replace("T", " ")
				.slice(0, 19);
			console.log(`${v.key.padEnd(maxKeyLen)}  ${date}`);
		}
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

export async function envUnset(
	key: string,
	options: EnvOptions,
): Promise<void> {
	try {
		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		await deleteEnvVar(token, projectId, key);
		console.log(`✓ Unset "${key}" for project "${projectId}".`);
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			if (error.statusCode === 404) {
				console.error(`✗ Env var "${key}" not found.`);
				process.exit(EXIT.GENERIC);
			}
			console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

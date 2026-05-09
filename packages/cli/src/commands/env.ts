import { ENV_VAR_KEY_REGEX } from "@devicesdk/core";
import {
	DeviceSDKApiError,
	deleteEnvVar,
	listEnvVars,
	setEnvVars,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import { emitJsonError, emitJsonSuccess, isJsonMode } from "../output.js";
import { loadConfig } from "../utils.js";

interface EnvOptions {
	project?: string;
	config?: string;
	json?: boolean;
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
	const json = isJsonMode(options);
	const docs = "https://devicesdk.com/docs/concepts/env-vars/";
	try {
		if (pairs.length === 0) {
			const msg = "Provide at least one KEY=VALUE pair.";
			if (json) emitJsonError(msg, { code: "missing_pairs", docs });
			else console.error(`✗ ${msg}`);
			process.exit(EXIT.GENERIC);
		}

		const vars: Record<string, string> = {};
		for (const pair of pairs) {
			const eqIdx = pair.indexOf("=");
			if (eqIdx === -1) {
				const msg = `Invalid format "${pair}". Expected KEY=VALUE.`;
				if (json) emitJsonError(msg, { code: "invalid_pair_format", docs });
				else console.error(`✗ ${msg}`);
				process.exit(EXIT.GENERIC);
			}
			const key = pair.slice(0, eqIdx);
			const value = pair.slice(eqIdx + 1);

			if (!ENV_VAR_KEY_REGEX.test(key)) {
				const msg = `Invalid key "${key}". Keys must be uppercase letters, digits, and underscores, starting with a letter (max 64 chars).`;
				if (json) emitJsonError(msg, { code: "invalid_env_key", docs });
				else console.error(`✗ ${msg}`);
				process.exit(EXIT.GENERIC);
			}

			vars[key] = value;
		}

		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		const result = await setEnvVars(token, projectId, vars);
		const count = result.count;
		if (json) {
			emitJsonSuccess({ projectId, count, keys: Object.keys(vars) });
			return;
		}
		console.log(
			`✓ Set ${count} env var${count !== 1 ? "s" : ""} for project "${projectId}".`,
		);
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			if (json) emitJsonError(error.message, { code: error.code, docs });
			else console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

export async function envList(options: EnvOptions): Promise<void> {
	const json = isJsonMode(options);
	try {
		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		const vars = await listEnvVars(token, projectId);

		if (json) {
			emitJsonSuccess({
				projectId,
				vars: vars.map((v) => ({ key: v.key, updatedAt: v.updated_at })),
			});
			return;
		}

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
			if (json)
				emitJsonError(error.message, {
					code: error.code,
					docs: "https://devicesdk.com/docs/concepts/env-vars/",
				});
			else console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

export async function envUnset(
	key: string,
	options: EnvOptions,
): Promise<void> {
	const json = isJsonMode(options);
	const docs = "https://devicesdk.com/docs/concepts/env-vars/";
	try {
		const token = await requireAuth();
		const projectId = await resolveProjectId(options);

		await deleteEnvVar(token, projectId, key);
		if (json) {
			emitJsonSuccess({ projectId, key, deleted: true });
			return;
		}
		console.log(`✓ Unset "${key}" for project "${projectId}".`);
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			if (error.statusCode === 404) {
				const msg = `Env var "${key}" not found.`;
				if (json) emitJsonError(msg, { code: "env_var_not_found", docs });
				else console.error(`✗ ${msg}`);
				process.exit(EXIT.GENERIC);
			}
			if (json) emitJsonError(error.message, { code: error.code, docs });
			else console.error(`✗ ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}

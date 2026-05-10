import type { Env } from "../types";
import { recordScriptInit, recordWorkerLoaderFailure } from "./analytics";

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

// Interface to check if the user script exports the required methods
interface UserScriptExports {
	onMessage?: unknown;
	onDeviceConnect?: unknown;
	onDeviceDisconnect?: unknown;
	onAlarm?: unknown;
}

// Validates user script by loading it in a dynamic worker and checking exports
export async function validateUserScript(
	env: Env,
	script: string,
	entrypointName: string,
): Promise<ValidationResult> {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entrypointName)) {
		return {
			valid: false,
			errors: ["Entrypoint name is not a valid JavaScript identifier"],
			warnings: [],
		};
	}

	const errors: string[] = [];
	const warnings: string[] = [];

	const validationStartedAt = Date.now();
	try {
		// Use a random ID since we're just validating
		const validationId = `validation:${crypto.randomUUID()}`;

		const worker = env.LOADER.get(validationId, async () => {
			return {
				compatibilityDate: "2025-06-01",
				mainModule: "main.js",
				modules: {
					"main.js": `
import { WorkerEntrypoint } from "cloudflare:workers";

import {${entrypointName}} from "./device.js";

function hasInstanceMethod(clazz, methodName) {
  let proto = clazz.prototype;
  while (proto && proto !== Object.prototype) {
    if (typeof proto[methodName] === 'function') {
      return true;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

const collectMethods = (target) => {
	const methods = [];
	if (hasInstanceMethod(target, 'onMessage')) methods.push('onMessage');
	if (hasInstanceMethod(target, 'onDeviceConnect')) methods.push('onDeviceConnect');
	if (hasInstanceMethod(target, 'onDeviceDisconnect')) methods.push('onDeviceDisconnect');
	if (hasInstanceMethod(target, 'onAlarm')) methods.push('onAlarm');

	return methods;
};

export class Validator extends WorkerEntrypoint {
	async validate() {		
		const methods = collectMethods(${entrypointName});
		
		return { methods };
	}
}`,
					"device.js": script,
				},
				env: {},
				globalOutbound: null,
			};
		});

		// Get the Validator entrypoint and call validate()
		const validator = worker.getEntrypoint("Validator") as {
			validate(): Promise<{
				methods: string[];
			}>;
		};

		const VALIDATION_TIMEOUT_MS = 5000;
		const result = await Promise.race([
			validator.validate(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("Script validation timed out")),
					VALIDATION_TIMEOUT_MS,
				),
			),
		]);

		recordScriptInit(env.ANALYTICS, {
			source: "validator",
			initLatencyMs: Date.now() - validationStartedAt,
		});

		// Check for required methods on the appropriate export
		if (!result.methods.includes("onMessage")) {
			errors.push(
				`Script must export an onMessage method in the ${entrypointName} class`,
			);
		}

		// Check for recommended methods
		if (!result.methods.includes("onDeviceConnect")) {
			warnings.push(
				"Script does not define onDeviceConnect - device connections won't trigger any initialization",
			);
		}
		if (!result.methods.includes("onDeviceDisconnect")) {
			warnings.push(
				"Script does not define onDeviceDisconnect - device disconnections won't trigger any cleanup",
			);
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		errors.push(`Script validation failed: ${errorMessage}`);
		const isTimeout = errorMessage.includes("Script validation timed out");
		recordWorkerLoaderFailure(env.ANALYTICS, {
			failureKind: isTimeout ? "validator_timeout" : "validator_error",
			errorName: error instanceof Error ? error.name : undefined,
			attemptCount: 1,
		});
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

import { JS_IDENTIFIER_REGEX } from "./consts";

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Statically validates an uploaded device-script bundle without executing it.
 * Bun.Transpiler.scan parses the module (surfacing syntax errors) and lists
 * its exports, so we can confirm the declared entrypoint class is exported.
 * Actual execution is deferred to first device connect (scriptHost).
 */
export async function validateUserScript(
	script: string,
	entrypointName: string,
): Promise<ValidationResult> {
	if (!JS_IDENTIFIER_REGEX.test(entrypointName)) {
		return {
			valid: false,
			errors: ["Entrypoint name is not a valid JavaScript identifier"],
			warnings: [],
		};
	}

	const transpiler = new Bun.Transpiler({ loader: "js" });
	let scanned: { exports: string[] };
	try {
		scanned = transpiler.scan(script);
	} catch (error) {
		return {
			valid: false,
			errors: [
				`Script failed to parse: ${error instanceof Error ? error.message : String(error)}`,
			],
			warnings: [],
		};
	}

	if (
		!scanned.exports.includes(entrypointName) &&
		!scanned.exports.includes("default")
	) {
		return {
			valid: false,
			errors: [
				`Script does not export "${entrypointName}" (exports found: ${scanned.exports.join(", ") || "none"})`,
			],
			warnings: [],
		};
	}

	return { valid: true, errors: [], warnings: [] };
}

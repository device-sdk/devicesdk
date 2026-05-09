/**
 * Helpers for emitting machine-readable JSON output from CLI commands.
 *
 * When `--json` is passed (or `DEVICESDK_OUTPUT=json` is set), commands write a
 * single JSON document to stdout in the same `{ success, result|error }` shape
 * used by the API, then exit. Errors get a stable `code` field where available.
 *
 * For long-running commands (`logs --tail`, `dev`), use `emitNdjson` to stream
 * one JSON object per line (newline-delimited JSON).
 */

export interface JsonOptions {
	json?: boolean;
}

export type JsonSuccess<T = unknown> = { success: true; result: T };
export type JsonError = {
	success: false;
	error: string;
	code?: string;
	docs?: string;
};

export function isJsonMode(opts?: { json?: boolean }): boolean {
	if (opts?.json) return true;
	return process.env.DEVICESDK_OUTPUT === "json";
}

export function emitJson<T>(payload: JsonSuccess<T> | JsonError): void {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function emitJsonSuccess<T>(result: T): void {
	emitJson({ success: true, result });
}

export function emitJsonError(
	error: string,
	extra: { code?: string; docs?: string } = {},
): void {
	process.stdout.write(
		`${JSON.stringify({ success: false, error, ...extra })}\n`,
	);
}

/**
 * Stream one JSON object per line. Each call writes a single record + newline.
 * Suitable for `logs --tail --json` and similar long-running flows.
 */
export function emitNdjson(record: unknown): void {
	process.stdout.write(`${JSON.stringify(record)}\n`);
}

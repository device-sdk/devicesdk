import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverMdnsHost } from "./mdnsDiscovery.js";

let verboseLogging = false;

export function setVerbose(verbose: boolean): void {
	verboseLogging = verbose;
}

// DeviceSDK is self-hosted: there is no default cloud endpoint. The server
// URL comes from (in precedence order) the DEVICESDK_API_URL env var, an
// explicit `--host` flag (setApiUrl), the host stored in
// ~/.devicesdk/credentials.json by `devicesdk login --host <url>`, or - as a
// last resort - an mDNS query for `<DEVICESDK_MDNS_HOSTNAME>.local`.
let apiUrlOverride: string | null = null;
let storedHostCache: string | null | undefined;
let mdnsHostCache: string | null | undefined;

/** Normalizes a user-supplied host: adds http:// when no scheme is given. */
export function normalizeHost(host: string): string {
	const trimmed = host.trim().replace(/\/+$/, "");
	if (/^https?:\/\//.test(trimmed)) return trimmed;
	return `http://${trimmed}`;
}

export function setApiUrl(url: string): void {
	apiUrlOverride = normalizeHost(url);
}

function readStoredHost(): string | null {
	try {
		const raw = readFileSync(
			path.join(os.homedir(), ".devicesdk", "credentials.json"),
			"utf-8",
		);
		const parsed = JSON.parse(raw) as { host?: unknown };
		return typeof parsed.host === "string" && parsed.host ? parsed.host : null;
	} catch {
		return null;
	}
}

export async function getApiUrl(): Promise<string> {
	if (process.env.DEVICESDK_API_URL) {
		return process.env.DEVICESDK_API_URL.replace(/\/+$/, "");
	}
	if (apiUrlOverride) return apiUrlOverride;
	if (storedHostCache === undefined) storedHostCache = readStoredHost();
	if (storedHostCache) return storedHostCache;

	if (mdnsHostCache === undefined) {
		mdnsHostCache = await discoverMdnsHost();
		if (mdnsHostCache) {
			console.error(
				`✓ Discovered DeviceSDK server at ${mdnsHostCache} via mDNS.`,
			);
			console.error(
				"  Use `devicesdk login --host <url>` to pin a different server.\n",
			);
		}
	}
	if (mdnsHostCache) return mdnsHostCache;

	console.error("✗ Error: No DeviceSDK server configured.\n");
	console.error(
		"  Connect this CLI to your self-hosted server with:\n" +
			"    devicesdk login --host http://<server>:8080\n\n" +
			"  Or set the DEVICESDK_API_URL environment variable.",
	);
	process.exit(1);
}

export interface ApiResponse<T> {
	success: boolean;
	result: T;
}

export interface ApiError {
	success: false;
	error: {
		message: string;
		code?: string;
	};
}

/**
 * Error thrown by every CLI ↔ API call when the response is non-2xx.
 *
 * `statusCode` is the HTTP status. `code` is a stable identifier (e.g.
 * `"invalid_token"`, `"FIRMWARE_NOT_PUBLISHED"`) suitable for `===` comparison.
 * `docs` is an absolute URL to a docs page explaining the error.
 *
 * @example
 * try { await deploy(); }
 * catch (err) {
 *   if (err instanceof DeviceSDKApiError) {
 *     if (err.code === "invalid_token") await login();
 *     console.error(err.message);
 *     if (err.docs) console.error(`See ${err.docs}`);
 *   }
 * }
 */
export class DeviceSDKApiError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public code?: string,
		public docs?: string,
		public responseBody?: unknown,
	) {
		super(message);
		this.name = "DeviceSDKApiError";
	}
}

const AUTH_EXPIRED_CODES = new Set([
	"invalid_refresh_token",
	"invalid_token",
	"invalid_cli_token",
	"missing_credentials",
	"unauthorized",
]);

// Programmatic error codes are short ASCII identifiers (e.g.
// `FIRMWARE_NOT_PUBLISHED`, `invalid_refresh_token`). Anything else - full
// sentences, punctuation, very long strings - is a human message that must not
// pollute `DeviceSDKApiError.code`, since downstream consumers compare it with
// `===` against a known code.
function looksLikeErrorCode(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 64 &&
		/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
	);
}

function looksLikeUrl(value: unknown): value is string {
	return (
		typeof value === "string" &&
		(value.startsWith("https://") || value.startsWith("http://"))
	);
}

export interface ParsedErrorBody {
	message: string | undefined;
	code: string | undefined;
	docs: string | undefined;
}

// Tolerate both the canonical `{ success: false, error: "string", code?, docs? }`
// and the legacy `{ error: { message, code } }` response shapes. Returns the
// human message, a stable identifier-shaped code, and an optional docs URL.
export function parseErrorBody(data: unknown): ParsedErrorBody {
	const obj = (data ?? undefined) as
		| { error?: unknown; code?: unknown; docs?: unknown }
		| undefined;
	const errorField = obj?.error;
	const errorString = typeof errorField === "string" ? errorField : undefined;
	const errorObject =
		errorField && typeof errorField === "object"
			? (errorField as { message?: unknown; code?: unknown; docs?: unknown })
			: undefined;
	const message =
		(typeof errorObject?.message === "string"
			? errorObject.message
			: undefined) ?? errorString;
	const explicitCode = obj?.code ?? errorObject?.code;
	const code = looksLikeErrorCode(explicitCode)
		? explicitCode
		: looksLikeErrorCode(errorString)
			? errorString
			: undefined;
	const docsField = obj?.docs ?? errorObject?.docs;
	const docs = looksLikeUrl(docsField) ? docsField : undefined;
	return { message, code, docs };
}

function isAuthExpired(status: number, code: string | undefined): boolean {
	return status === 401 && code !== undefined && AUTH_EXPIRED_CODES.has(code);
}

// Build the human-facing message for an error response. Auth-expired sessions
// collapse to a single line; other 401s append a re-auth hint to whatever the
// server said; everything else falls back to a generic status line.
export function buildErrorMessage(
	status: number,
	parsed: ParsedErrorBody,
): string {
	if (isAuthExpired(status, parsed.code)) {
		return "Session expired - run `devicesdk login`.";
	}
	const base = parsed.message || `Request failed with status ${status}`;
	if (status === 401) {
		return `${base}\nPlease run \`devicesdk login\` to re-authenticate.`;
	}
	return base;
}

// Verbose mode is the escape hatch for raw response bodies; otherwise we keep
// the user-facing surface to a single line. Dumping JSON for every 4xx burns
// user attention without telling them what to do.
export function dumpResponseBodyIfVerbose(
	status: number,
	data: unknown,
	responseText: string | undefined,
): void {
	if (!verboseLogging) return;
	if ((data === null || data === undefined) && !responseText) return;
	console.error(`\nResponse body (${status}):`);
	try {
		console.error(JSON.stringify(data ?? responseText, null, 2));
	} catch {
		console.error(responseText ?? "");
	}
}

export async function request<T>(
	endpoint: string,
	options: RequestInit = {},
	token?: string,
	unwrapResult: boolean = true,
): Promise<T> {
	const url = `${await getApiUrl()}${endpoint}`;
	const method = options.method || "GET";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options.headers as Record<string, string>),
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	if (verboseLogging) {
		console.log(`[request] ${method} ${url}`);
	}

	const response = await fetch(url, {
		...options,
		headers,
	});

	if (verboseLogging) {
		console.log(`[request] Response status: ${response.status}`);
	}

	const responseText = await response.text();
	let data: unknown = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		// response is not JSON
	}

	if (!response.ok) {
		const parsed = parseErrorBody(data);
		dumpResponseBodyIfVerbose(response.status, data, responseText);
		throw new DeviceSDKApiError(
			buildErrorMessage(response.status, parsed),
			response.status,
			parsed.code,
			parsed.docs,
			data ?? responseText,
		);
	}

	// Some endpoints return data directly, others wrap in { success, result }
	const envelope =
		data && typeof data === "object"
			? (data as { success?: boolean; result?: unknown })
			: null;

	if (unwrapResult && envelope?.success === false) {
		const parsed = parseErrorBody(data);
		throw new DeviceSDKApiError(
			parsed.message || "Request failed",
			response.status,
			parsed.code,
			parsed.docs,
			data,
		);
	}

	return (
		unwrapResult && envelope?.result !== undefined
			? envelope.result
			: (data ?? responseText)
	) as T;
}

export async function fetchAllPages<T>(
	endpoint: string,
	token: string,
): Promise<T[]> {
	const all: T[] = [];
	let page = 1;
	const per_page = 100;
	let hasMore = true;
	while (hasMore) {
		const result = await request<{
			items: T[];
			page: number;
			per_page: number;
			has_more: boolean;
		}>(`${endpoint}?page=${page}&per_page=${per_page}`, {}, token);
		all.push(...result.items);
		hasMore = result.has_more;
		page++;
	}
	return all;
}

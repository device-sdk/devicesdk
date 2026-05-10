const DEFAULT_API_URL = "https://api.devicesdk.com";

let verboseLogging = false;

export function setVerbose(verbose: boolean): void {
	verboseLogging = verbose;
}

export function getApiUrl(): string {
	return process.env.DEVICESDK_API_URL || DEFAULT_API_URL;
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
// `FIRMWARE_NOT_PUBLISHED`, `invalid_refresh_token`). Anything else — full
// sentences, punctuation, very long strings — is a human message that must not
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

interface ParsedErrorBody {
	message: string | undefined;
	code: string | undefined;
	docs: string | undefined;
}

// Tolerate both the canonical `{ success: false, error: "string", code?, docs? }`
// and the legacy `{ error: { message, code } }` response shapes. Returns the
// human message, a stable identifier-shaped code, and an optional docs URL.
function parseErrorBody(data: unknown): ParsedErrorBody {
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
function buildErrorMessage(status: number, parsed: ParsedErrorBody): string {
	if (isAuthExpired(status, parsed.code)) {
		return "Session expired — run `devicesdk login`.";
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
function dumpResponseBodyIfVerbose(
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

async function request<T>(
	endpoint: string,
	options: RequestInit = {},
	token?: string,
	unwrapResult: boolean = true,
): Promise<T> {
	const url = `${getApiUrl()}${endpoint}`;
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

async function fetchAllPages<T>(endpoint: string, token: string): Promise<T[]> {
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

// User endpoints
export interface User {
	id: string;
	name?: string;
	picture?: string;
	email: string;
	verified_email: number;
	created_at: number;
}

export async function getMe(token: string): Promise<User> {
	return request<User>("/v1/user/me", {}, token);
}

// CLI Auth endpoints
export interface AuthStartResponse {
	device_code: string;
	user_code: string;
	verification_url: string;
	verification_url_complete?: string;
	expires_in: number;
	interval: number;
}

export async function startAuth(): Promise<AuthStartResponse> {
	const url = `${getApiUrl()}/v1/cli/auth/start`;

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
		});

		const responseText = await response.text();
		let data: unknown = null;
		try {
			data = responseText ? JSON.parse(responseText) : null;
		} catch {
			// non-JSON response body
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

		// Unwrap the result
		const obj = data as { result?: AuthStartResponse } | null;
		return obj?.result ?? (data as AuthStartResponse);
	} catch (error) {
		console.error("startAuth error:", error);
		throw error;
	}
}

export interface AuthPollResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

export async function pollAuth(
	deviceCode: string,
): Promise<AuthPollResponse | null> {
	try {
		const result = await request<AuthPollResponse | { status: string }>(
			"/v1/cli/auth/poll",
			{
				method: "POST",
				body: JSON.stringify({ device_code: deviceCode }),
			},
			undefined,
			true,
		);

		// Check if the response indicates pending status
		if (
			result &&
			typeof result === "object" &&
			"status" in result &&
			result.status === "pending"
		) {
			return null;
		}

		return result as AuthPollResponse;
	} catch (error) {
		// If it's a 401 error, return null (user hasn't approved yet)
		if (error instanceof DeviceSDKApiError && error.statusCode === 401) {
			return null;
		}
		throw error;
	}
}

export async function refreshToken(
	refreshToken: string,
): Promise<AuthPollResponse> {
	return request<AuthPollResponse>("/v1/cli/auth/refresh", {
		method: "POST",
		body: JSON.stringify({ refresh_token: refreshToken }),
	});
}

export async function revokeToken(token: string): Promise<void> {
	await request(
		"/v1/cli/auth/revoke",
		{
			method: "POST",
		},
		token,
	);
}

// Project endpoints
export interface Project {
	id: string;
	project_slug: string;
	name?: string | null;
	description?: string | null;
	created_at: number;
	device_count?: number;
	devices?: Device[];
}

export async function listProjects(token: string): Promise<Project[]> {
	return fetchAllPages<Project>("/v1/projects", token);
}

export async function getProject(
	token: string,
	projectId: string,
): Promise<Project> {
	return request<Project>(`/v1/projects/${projectId}`, {}, token);
}

export async function createProject(
	token: string,
	projectId: string,
	name?: string,
	description?: string,
): Promise<Project> {
	return request<Project>(
		"/v1/projects",
		{
			method: "POST",
			body: JSON.stringify({ project_slug: projectId, name, description }),
		},
		token,
	);
}

export async function deleteProject(
	token: string,
	projectId: string,
): Promise<{ deleted: boolean; project_slug: string }> {
	return request<{ deleted: boolean; project_slug: string }>(
		`/v1/projects/${projectId}`,
		{
			method: "DELETE",
		},
		token,
	);
}

// Device endpoints
export interface Device {
	id: string;
	device_id: string;
	name?: string | null;
	description?: string | null;
	current_version_id?: string | null;
	last_connected_at?: number | null;
	created_at: number;
	updated_at: number;
	status?: string;
}

export async function listDevices(
	token: string,
	projectId: string,
): Promise<Device[]> {
	return fetchAllPages<Device>(`/v1/projects/${projectId}/devices`, token);
}

export async function getDevice(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<Device> {
	return request<Device>(
		`/v1/projects/${projectId}/devices/${deviceId}`,
		{},
		token,
	);
}

export async function createDevice(
	token: string,
	projectId: string,
	deviceId: string,
	name?: string,
	description?: string,
): Promise<Device> {
	return request<Device>(
		`/v1/projects/${projectId}/devices`,
		{
			method: "POST",
			body: JSON.stringify({ device_id: deviceId, name, description }),
		},
		token,
	);
}

export interface DeviceStatus {
	connected: boolean;
	connected_since: number | null;
	last_connected_at: number | null;
	current_version_id: string | null;
}

export async function getDeviceStatus(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<DeviceStatus> {
	return request<DeviceStatus>(
		`/v1/projects/${projectId}/devices/${deviceId}/status`,
		{},
		token,
	);
}

export async function deleteDevice(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<{ deleted: boolean; device_id: string }> {
	return request<{ deleted: boolean; device_id: string }>(
		`/v1/projects/${projectId}/devices/${deviceId}`,
		{
			method: "DELETE",
		},
		token,
	);
}

import type { DeviceType } from "./config.js";
export type { DeviceType };

export function isEsp32DeviceType(deviceType: DeviceType): boolean {
	return deviceType.startsWith("esp32");
}

export function getEsp32ChipName(deviceType: DeviceType): string {
	if (deviceType === "esp32c61") return "esp32c61";
	if (deviceType === "esp32c3") return "esp32c3";
	return "esp32";
}

export function isPicoDeviceType(deviceType: DeviceType): boolean {
	return deviceType === "pico-w" || deviceType === "pico2-w";
}

export async function downloadDeviceFirmware(
	token: string,
	projectId: string,
	deviceId: string,
	wifi: { ssid: string; password: string },
	deviceType: DeviceType,
	options?: { host?: string },
): Promise<Buffer> {
	const url = `${getApiUrl()}/v1/projects/${projectId}/devices/${deviceId}/firmware`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			ssid: wifi.ssid,
			pass: wifi.password,
			device_type: deviceType,
			...(options?.host ? { host: options.host } : {}),
		}),
	});

	if (!response.ok) {
		let responseBody: unknown;
		let responseText: string | undefined;
		try {
			responseText = await response.text();
			responseBody = responseText ? JSON.parse(responseText) : undefined;
		} catch {
			// ignore parse failure
		}

		const parsed = parseErrorBody(responseBody);
		dumpResponseBodyIfVerbose(response.status, responseBody, responseText);
		throw new DeviceSDKApiError(
			buildErrorMessage(response.status, parsed),
			response.status,
			parsed.code,
			parsed.docs,
			responseBody ?? responseText,
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

// Script endpoints
export interface ScriptVersion {
	version_id: string;
	message?: string | null;
	is_current?: boolean;
	script?: string;
	created_at: number;
}

export interface UploadScriptResult {
	version_id: string;
	device_id: string;
	message?: string | null;
	created_at: number;
	device_rebooted: boolean;
	reboot_reason: string;
}

export async function getScript(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<{ version_id: string | null; script: string }> {
	return request<{ version_id: string | null; script: string }>(
		`/v1/projects/${projectId}/devices/${deviceId}/script`,
		{},
		token,
	);
}

export async function uploadScript(
	token: string,
	projectId: string,
	deviceId: string,
	script: string,
	message?: string,
	entrypoint?: string,
): Promise<UploadScriptResult> {
	const body: { script: string; message?: string; entrypoint?: string } = {
		script,
		message,
	};
	if (entrypoint) {
		body.entrypoint = entrypoint;
	}
	return request<UploadScriptResult>(
		`/v1/projects/${projectId}/devices/${deviceId}/script`,
		{
			method: "PUT",
			body: JSON.stringify(body),
		},
		token,
	);
}

export async function listScriptVersions(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<ScriptVersion[]> {
	return request<ScriptVersion[]>(
		`/v1/projects/${projectId}/devices/${deviceId}/script/versions`,
		{},
		token,
	);
}

export async function getScriptVersion(
	token: string,
	projectId: string,
	deviceId: string,
	versionId: string,
): Promise<ScriptVersion> {
	return request<ScriptVersion>(
		`/v1/projects/${projectId}/devices/${deviceId}/script/versions/${versionId}`,
		{},
		token,
	);
}

export async function deployScriptVersion(
	token: string,
	projectId: string,
	deviceId: string,
	versionId: string,
): Promise<{ version_id: string; device_id: string; deployed_at: number }> {
	return request<{
		version_id: string;
		device_id: string;
		deployed_at: number;
	}>(
		`/v1/projects/${projectId}/devices/${deviceId}/script/versions/${versionId}/deploy`,
		{ method: "POST" },
		token,
	);
}

export interface BatchUploadResult {
	versions: Array<{
		device_id: string;
		version_id: string;
		status: "success" | "created";
		device_rebooted: boolean;
		reboot_reason: string;
	}>;
	message?: string | null;
}

export async function uploadScriptsBatch(
	token: string,
	projectId: string,
	devices: Record<string, { script: string; entrypoint?: string }>,
	message?: string,
): Promise<BatchUploadResult> {
	return request<BatchUploadResult>(
		`/v1/projects/${projectId}/scripts`,
		{
			method: "PUT",
			body: JSON.stringify({ devices, message }),
		},
		token,
	);
}

// Entity declarations (Home Assistant integration)
export async function upsertDeviceEntities(
	token: string,
	projectId: string,
	deviceId: string,
	entities: unknown[],
): Promise<{ count: number }> {
	return request<{ count: number }>(
		`/v1/projects/${projectId}/devices/${deviceId}/entities`,
		{
			method: "PUT",
			body: JSON.stringify({ entities }),
		},
		token,
	);
}

// Logs — over the watcher WebSocket. The HTTP /logs endpoint was retired in
// May 2026 (returns 410 with a Link header pointing here). See the comment
// block on `BaseDevice.getLogs` in apps/api/src/durableObjects/lib/device.ts.
export interface LogEntry {
	id: string;
	level: string;
	message: string;
	created_at: number;
}

/**
 * Builds the `ws://` or `wss://` URL for the watcher WebSocket. Mirrors the
 * dashboard helper in apps/dashboard/src/services/api.service.ts. The scheme
 * is derived from the configured API URL — local dev (http://) gets ws://,
 * everything else gets wss://.
 */
export function getWatchUrl(
	projectId: string,
	deviceId: string,
	options?: { backfillLimit?: number; backfillLevel?: string },
): string {
	const apiUrl = getApiUrl();
	const base = apiUrl.startsWith("http://")
		? apiUrl.replace("http://", "ws://")
		: apiUrl.replace("https://", "wss://");
	const url = `${base}/v1/projects/${projectId}/devices/${deviceId}/watch`;
	const params = new URLSearchParams();
	if (options?.backfillLimit != null) {
		params.set("backfillLimit", String(options.backfillLimit));
	}
	if (options?.backfillLevel) {
		params.set("backfillLevel", options.backfillLevel);
	}
	const qs = params.toString();
	return qs ? `${url}?${qs}` : url;
}

// Token endpoints
export interface ApiToken {
	id: string;
	token?: string;
	last_four: string;
	created_at: number;
}

export async function listTokens(token: string): Promise<ApiToken[]> {
	return fetchAllPages<ApiToken>("/v1/tokens", token);
}

export async function createToken(
	token: string,
): Promise<{ id: string; token: string; created_at: number }> {
	return request<{ id: string; token: string; created_at: number }>(
		"/v1/tokens",
		{
			method: "POST",
		},
		token,
	);
}

export async function deleteToken(
	token: string,
	tokenId: string,
): Promise<void> {
	await request(
		`/v1/tokens/${tokenId}`,
		{
			method: "DELETE",
		},
		token,
	);
}

// Device command endpoints
export interface DeviceCommandRequest {
	type: string;
	payload: Record<string, unknown>;
}

export interface DeviceCommandResponse {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}

export async function sendDeviceCommand(
	token: string,
	projectId: string,
	deviceId: string,
	command: DeviceCommandRequest,
): Promise<DeviceCommandResponse> {
	return request<DeviceCommandResponse>(
		`/v1/projects/${projectId}/devices/${deviceId}/command`,
		{
			method: "POST",
			body: JSON.stringify(command),
		},
		token,
	);
}

// Env vars endpoints
export interface EnvVarEntry {
	key: string;
	updated_at: number;
}

export async function listEnvVars(
	token: string,
	projectId: string,
): Promise<EnvVarEntry[]> {
	const result = await request<{ vars: EnvVarEntry[] }>(
		`/v1/projects/${projectId}/env`,
		{},
		token,
	);
	return result.vars;
}

export async function setEnvVars(
	token: string,
	projectId: string,
	vars: Record<string, string>,
): Promise<{ count: number }> {
	return request<{ count: number }>(
		`/v1/projects/${projectId}/env`,
		{
			method: "PUT",
			body: JSON.stringify({ vars }),
		},
		token,
	);
}

export async function deleteEnvVar(
	token: string,
	projectId: string,
	key: string,
): Promise<{ deleted: boolean; key: string }> {
	return request<{ deleted: boolean; key: string }>(
		`/v1/projects/${projectId}/env/${encodeURIComponent(key)}`,
		{
			method: "DELETE",
		},
		token,
	);
}

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

export class DeviceSDKApiError extends Error {
	constructor(
		message: string,
		public statusCode: number,
		public code?: string,
		public responseBody?: any,
	) {
		super(message);
		this.name = "DeviceSDKApiError";
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
	let data: any = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		// response is not JSON
	}

	if (!response.ok) {
		if (responseText) {
			console.error(`
Response body (${response.status}):`);
			try {
				console.error(JSON.stringify(data ?? responseText, null, 2));
			} catch {
				console.error(responseText);
			}
		}

		let message =
			data?.error?.message || `Request failed with status ${response.status}`;
		if (response.status === 401) {
			message += "\nPlease run `npx devicesdk login` to re-authenticate.";
		}
		throw new DeviceSDKApiError(
			message,
			response.status,
			data?.error?.code,
			data ?? responseText,
		);
	}

	// Some endpoints return data directly, others wrap in { success, result }
	if (unwrapResult && data?.success === false) {
		throw new DeviceSDKApiError(
			data.error?.message || "Request failed",
			response.status,
			data.error?.code,
			data,
		);
	}

	return unwrapResult && data?.result !== undefined
		? data.result
		: (data ?? responseText);
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

		const data = await response.json();

		if (!response.ok) {
			throw new DeviceSDKApiError(
				data.error?.message || `Request failed with status ${response.status}`,
				response.status,
				data.error?.code,
			);
		}

		// Unwrap the result
		return data.result || data;
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
		let message = `Request failed with status ${response.status}`;
		let responseBody: any;
		let responseText: string | undefined;
		try {
			responseText = await response.text();
			responseBody = responseText ? JSON.parse(responseText) : undefined;
			message = responseBody?.error?.message || message;
		} catch {
			// ignore parse failure
		}

		if (responseBody || responseText) {
			console.error(`
Response body (${response.status}):`);
			try {
				console.error(JSON.stringify(responseBody ?? responseText, null, 2));
			} catch {
				console.error(responseText);
			}
		}

		if (response.status === 401) {
			message += "\nPlease run `npx devicesdk login` to re-authenticate.";
		}
		throw new DeviceSDKApiError(
			message,
			response.status,
			responseBody?.error?.code,
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
	const body: any = { script, message };
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

// Logs endpoints
export interface LogEntry {
	id: string;
	level: string;
	message: string;
	created_at: number;
}

export interface LogsResponse {
	logs: LogEntry[];
	next_cursor: string | null;
}

export async function getLogs(
	token: string,
	projectId: string,
	deviceId: string,
	options: { cursor?: string; limit?: number; level?: string } = {},
): Promise<LogsResponse> {
	const params = new URLSearchParams();
	if (options.cursor) params.set("cursor", options.cursor);
	if (options.limit !== undefined) params.set("limit", String(options.limit));
	if (options.level) params.set("level", options.level);

	const query = params.toString() ? `?${params}` : "";
	return request<LogsResponse>(
		`/v1/projects/${projectId}/devices/${deviceId}/logs${query}`,
		{},
		token,
	);
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

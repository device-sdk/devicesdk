import { request } from "./shared.js";

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

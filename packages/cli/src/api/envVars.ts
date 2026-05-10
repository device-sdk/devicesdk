import { request } from "./shared.js";

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

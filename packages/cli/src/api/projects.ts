import type { Device } from "./devices.js";
import { fetchAllPages, request } from "./shared.js";

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

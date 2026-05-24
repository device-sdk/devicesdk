import { request } from "./shared.js";

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

import type { AppContext, tableDevices, tableProjects } from "../types";

/**
 * Resolves a (project, device) pair scoped to the authenticated user.
 *
 * Every device endpoint needs the same two lookups: find the project by
 * `(user_id, project_slug)`, then find the device by `(project_id, device_slug)`.
 * This helper centralizes the pattern and returns a 404 JSON response on either
 * miss - callers must check `instanceof Response` and forward if so.
 *
 * Usage:
 * ```ts
 * const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
 * if (resolved instanceof Response) return resolved;
 * const { project, device } = resolved;
 * ```
 */
export async function resolveProjectAndDevice(
	c: AppContext,
	projectId: string,
	deviceId: string,
): Promise<{ project: tableProjects; device: tableDevices } | Response> {
	const user = c.get("user");
	const qb = c.get("qb");

	const project = await qb
		.fetchOne<tableProjects>({
			tableName: "projects",
			where: {
				conditions: ["user_id = ?1", "project_slug = ?2"],
				params: [user.id, projectId],
			},
		})
		.execute()
		.then((p) => p.results);

	if (!project) {
		return c.json({ success: false, error: "Project not found" }, 404);
	}

	const device = await qb
		.fetchOne<tableDevices>({
			tableName: "devices",
			where: {
				conditions: ["project_id = ?1", "device_slug = ?2"],
				params: [project.id, deviceId],
			},
		})
		.execute()
		.then((d) => d.results);

	if (!device) {
		return c.json({ success: false, error: "Device not found" }, 404);
	}

	return { project, device };
}

import * as Sentry from "@sentry/cloudflare";
import { getDeviceStub } from "../../foundation/durableObjectStub";
import type { AppContext, tableDevices, tableProjects } from "../../types";

/**
 * SSE endpoint for streaming device logs in real time.
 * GET /v1/projects/:projectId/devices/:deviceId/logs/stream
 */
export async function streamLogs(c: AppContext) {
	const user = c.get("user");
	const qb = c.get("qb");
	const projectId = c.req.param("projectId");
	const deviceId = c.req.param("deviceId");

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

	const stub = getDeviceStub(c.env, project.id, device.id);

	let stream: ReadableStream<Uint8Array>;
	try {
		stream = await stub.streamLogs();
	} catch (err) {
		Sentry.captureException(err);
		return c.json(
			{ success: false, error: "Device service temporarily unavailable" },
			503,
		);
	}

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

import type { Env } from "../types";

/**
 * Deletes every trace of a user: projects, devices, device scripts, script
 * blobs, device kv/logs/usage, env vars, tokens, CLI tokens, pending CLI auth
 * codes, and sessions. Called from the delete-account endpoint; deletion is
 * immediate with no grace period.
 */
export async function purgeUserData(env: Env, userId: string): Promise<void> {
	const projects = await env.DB.prepare(
		"SELECT id, project_slug FROM projects WHERE user_id = ?",
	)
		.bind(userId)
		.all<{ id: string; project_slug: string }>();

	for (const project of projects.results) {
		const devices = await env.DB.prepare(
			"SELECT id FROM devices WHERE project_id = ?",
		)
			.bind(project.id)
			.all<{ id: string }>();

		for (const device of devices.results) {
			await env.DB.prepare("DELETE FROM device_scripts WHERE device_id = ?")
				.bind(device.id)
				.run();
			// device_kv/logs/usage have no FK to devices - purge them
			// explicitly or the deleted user's data survives forever.
			await env.DB.prepare("DELETE FROM device_kv WHERE device_id = ?")
				.bind(device.id)
				.run();
			await env.DB.prepare("DELETE FROM device_logs WHERE device_id = ?")
				.bind(device.id)
				.run();
			await env.DB.prepare("DELETE FROM device_usage WHERE device_id = ?")
				.bind(device.id)
				.run();
		}

		await env.DB.prepare("DELETE FROM devices WHERE project_id = ?")
			.bind(project.id)
			.run();

		// Script blobs are keyed {userId}/... - delete everything under the
		// project prefix (paginated; list caps each page).
		const prefix = `${userId}/${project.project_slug}/`;
		let cursor: string | undefined;
		do {
			const listed = await env.SCRIPTS.list({ prefix, cursor });
			for (const obj of listed.objects) {
				await env.SCRIPTS.delete(obj.key);
			}
			cursor = listed.truncated ? listed.cursor : undefined;
		} while (cursor);

		await env.DB.prepare("DELETE FROM project_env_vars WHERE project_id = ?")
			.bind(project.id)
			.run();
	}

	await env.DB.prepare("DELETE FROM projects WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM tokens WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM cli_tokens WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM cli_auth_codes WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();
}

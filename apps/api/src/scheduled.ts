import { DELETION_GRACE_PERIOD_MS } from "./foundation/consts";
import type { Env } from "./types";

/**
 * Scheduled handler for cron-triggered tasks:
 * 1. Account deletion — purge users past 7-day grace period
 * 2. Session cleanup — remove expired sessions, rate limits, CLI auth codes
 */
export async function handleScheduled(
	_event: ScheduledEvent | { cron: string; scheduledTime: number },
	env: Env,
	_ctx: ExecutionContext | { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
	await purgeDeletedAccounts(env);
	await cleanupExpiredRecords(env);
}

async function purgeDeletedAccounts(env: Env): Promise<void> {
	const cutoff = Date.now() - DELETION_GRACE_PERIOD_MS;

	// Find users whose deletion grace period has expired (batch of 10)
	const users = await env.DB.prepare(
		"SELECT id FROM user WHERE deletion_requested_at IS NOT NULL AND deletion_requested_at < ? LIMIT 10",
	)
		.bind(cutoff)
		.all<{ id: string }>();

	if (!users.results || users.results.length === 0) {
		return;
	}

	for (const user of users.results) {
		await purgeUserData(env, user.id);
	}
}

async function purgeUserData(env: Env, userId: string): Promise<void> {
	// Get all project slugs for R2 cleanup
	const projects = await env.DB.prepare(
		"SELECT id, project_slug FROM projects WHERE user_id = ?",
	)
		.bind(userId)
		.all<{ id: string; project_slug: string }>();

	if (projects.results) {
		for (const project of projects.results) {
			// Get device IDs for this project
			const devices = await env.DB.prepare(
				"SELECT id FROM devices WHERE project_id = ?",
			)
				.bind(project.id)
				.all<{ id: string }>();

			if (devices.results) {
				for (const device of devices.results) {
					// Delete device_scripts records
					await env.DB.prepare("DELETE FROM device_scripts WHERE device_id = ?")
						.bind(device.id)
						.run();
				}

				// Delete devices
				await env.DB.prepare("DELETE FROM devices WHERE project_id = ?")
					.bind(project.id)
					.run();
			}

			// Delete R2 script objects for this project
			const r2Prefix = `${userId}/${project.project_slug}/`;
			const objects = await env.SCRIPTS.list({ prefix: r2Prefix });
			for (const obj of objects.objects) {
				await env.SCRIPTS.delete(obj.key);
			}

			// Delete project env vars
			await env.DB.prepare("DELETE FROM project_env_vars WHERE project_id = ?")
				.bind(project.id)
				.run();
		}

		// Delete all projects
		await env.DB.prepare("DELETE FROM projects WHERE user_id = ?")
			.bind(userId)
			.run();
	}

	// Delete tokens, CLI tokens, sessions, rate limits
	await env.DB.prepare("DELETE FROM tokens WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM cli_tokens WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?")
		.bind(userId)
		.run();
	await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?")
		.bind(`user:${userId}`)
		.run();

	// Delete the user row
	await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(userId).run();
}

async function cleanupExpiredRecords(env: Env): Promise<void> {
	const now = Date.now();

	await env.DB.prepare("DELETE FROM user_sessions WHERE expires_at < ?")
		.bind(now)
		.run();
	await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?")
		.bind(now)
		.run();
	await env.DB.prepare("DELETE FROM cli_auth_codes WHERE expires_at < ?")
		.bind(now)
		.run();
}

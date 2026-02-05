import { beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { D1QB } from "workers-qb";
import { hashPassword } from "../src/foundation/auth";
import type { tableUser, tableProjects, tableUserSessions } from "../src/types";

export const TEST_SESSION_TOKEN = "test-session-token";
export const TEST_USER_ID = "user-1";
export const TEST_PROJECT_ID = "smart-home";

beforeAll(async () => {
	const qb = new D1QB(env.DB);

	// Clean all tables
	await env.DB.prepare("DELETE FROM device_scripts").run();
	await env.DB.prepare("DELETE FROM devices").run();
	await env.DB.prepare("DELETE FROM tokens").run();
	await env.DB.prepare("DELETE FROM user_sessions").run();
	await env.DB.prepare("DELETE FROM projects").run();
	await env.DB.prepare("DELETE FROM user").run();

	// Create test users
	const testUsers: tableUser[] = [
		{
			id: TEST_USER_ID,
			name: "Alice Johnson",
			email: "alice@example.com",
			verified_email: 1,
			picture: "https://example.com/alice.jpg",
			created_at: Date.now(),
		},
		{
			id: "user-2",
			name: "Bob Smith",
			email: "bob@example.com",
			verified_email: 1,
			picture: "https://example.com/bob.jpg",
			created_at: Date.now(),
		},
		{
			id: "user-3",
			name: "Charlie Brown",
			email: "charlie@example.com",
			verified_email: 1,
			picture: "https://example.com/charlie.jpg",
			created_at: Date.now(),
		},
	];

	for (const user of testUsers) {
		await qb
			.insert<tableUser>({
				tableName: "user",
				data: user,
				onConflict: 'IGNORE'
			})
			.execute();
	}

	// Create test projects
	const testProjects: tableProjects[] = [
		{
			id: "proj-1",
			user_id: TEST_USER_ID,
			project_slug: "smart-home",
			name: "Smart Home",
			description: "IoT smart home automation project",
			created_at: Date.now(),
		},
		{
			id: "proj-2",
			user_id: TEST_USER_ID,
			project_slug: "weather-station",
			name: "Weather Station",
			description: "IoT weather monitoring system",
			created_at: Date.now(),
		},
		{
			id: "proj-3",
			user_id: "user-2",
			project_slug: "plant-monitor",
			name: "Plant Monitor",
			description: "IoT plant health monitoring",
			created_at: Date.now(),
		},
		{
			id: "proj-4",
			user_id: "user-3",
			project_slug: "energy-tracker",
			name: "Energy Tracker",
			description: "IoT energy consumption tracker",
			created_at: Date.now(),
		},
	];

	for (const project of testProjects) {
		await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: project,
				onConflict: 'IGNORE'
			})
			.execute();
	}

	const now = Date.now();
	await qb
		.insert<tableUserSessions>({
			tableName: "user_sessions",
			data: {
				user_id: TEST_USER_ID,
				token: TEST_SESSION_TOKEN,
				created_at: now,
				expires_at: now + 86400000, // 24 hours from now
			},
			onConflict: 'IGNORE'
		})
		.execute();
});

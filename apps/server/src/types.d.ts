import type { Server } from "bun";
import type { Context } from "hono";
import type { ServerConfig } from "./config";
import type { BunSqliteQB } from "./db/bunSqliteQB";
import type { D1CompatDatabase } from "./db/d1Compat";
import type { DeviceHub } from "./runtime/deviceHub";
import type { FsBlobStore } from "./storage/fsBlobStore";

/**
 * Services constructed once at boot and passed to every request as `c.env`
 * (second argument of `app.fetch`). Property names intentionally match the
 * old Cloudflare binding names (SCRIPTS, FIRMWARES, DEVICE) so the endpoint
 * files ported from apps/api compile unchanged.
 */
export interface Env {
	SCRIPTS: FsBlobStore;
	FIRMWARES: FsBlobStore;
	DEVICE: DeviceHub;
	qb: BunSqliteQB;
	/** D1-compatible facade so ported `c.env.DB.prepare(...)` call sites work. */
	DB: D1CompatDatabase;
	ENV: "local" | "production";
	config: ServerConfig;
	/**
	 * The Bun server handle — hono's bun adapter resolves it from c.env.server
	 * to perform WebSocket upgrades. Assigned right after Bun.serve() returns.
	 */
	server: Server | undefined;
}

export type tableUser = {
	id: string;
	name?: string;
	picture?: string;
	email: string;
	verified_email: number;
	password_hash?: string;
	onboarding_completed: number;
	created_at: number;
};
export type tableUserSessions = {
	id?: number;
	user_id: string;
	token: string;
	created_at: number;
	expires_at: number;
};

export type tableProjects = {
	id: string;
	user_id: string;
	project_slug: string;
	name?: string;
	description?: string;
	created_at: number;
	updated_at?: number;
};

export type tableProjectVersions = {
	id: string;
	project_id: string;
	version_id: string;
	created_at: number;
};

export type tableDevices = {
	id: string;
	project_id: string;
	device_slug: string;
	name?: string;
	description?: string;
	current_version_id?: string;
	last_connected_at?: number;
	connected?: number;
	created_at: number;
	updated_at: number;
};

export type tableDeviceScripts = {
	id: string;
	device_id: string;
	version_id: string;
	entrypoint: string;
	message?: string;
	created_at: number;
};

export type tableTokens = {
	id: string;
	user_id: string;
	token: string;
	created_at: number;
	description?: string;
	managed?: number;
	token_hash?: string;
	last_four?: string;
};

export type tableProjectEnvVars = {
	id: string;
	project_id: string;
	key: string;
	value: string;
	created_at: number;
	updated_at: number;
};

export type tableDeviceEntityConfigs = {
	id: string;
	device_id: string;
	entity_id: string;
	config: string;
	created_at: number;
	updated_at: number;
};

export interface Variables {
	user: tableUser;
	qb: BunSqliteQB;
}

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
export type HandleArgs = [AppContext];

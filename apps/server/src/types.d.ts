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
	 * The Bun server handle - hono's bun adapter resolves it from c.env.server
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
	// Vestigial schema columns (migrations 0016-0018): present in the table
	// (NOT NULL DEFAULT 'free' / nullable) but not read anywhere yet.
	plan?: string;
	suspended_at?: number | null;
	deletion_requested_at?: number | null;
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

export type tableDevices = {
	id: string;
	project_id: string;
	device_slug: string;
	name?: string;
	description?: string;
	current_version_id?: string;
	last_connected_at?: number;
	connected?: number;
	firmware_version?: string | null;
	device_type?: string | null;
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
	created_at: number;
	description?: string;
	managed?: number;
	token_hash?: string;
	last_four?: string;
	/** NULL = never expires (all pre-existing and dashboard-created tokens). */
	expires_at?: number | null;
};

export type tableOauthClients = {
	id: string;
	client_name: string;
	/** JSON-encoded array of exact-match redirect URIs. */
	redirect_uris: string;
	created_at: number;
};

export type tableOauthAuthCodes = {
	id: string;
	code_hash: string;
	client_id: string;
	user_id: string;
	redirect_uri: string;
	code_challenge: string;
	created_at: number;
	expires_at: number;
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

import type { Context } from "hono";
import { D1QB } from "workers-qb";

// Worker Loader types for dynamic worker loading
interface WorkerCode {
	compatibilityDate: string;
	compatibilityFlags?: string[];
	allowExperimental?: boolean;
	mainModule: string;
	modules: Record<
		string,
		| string
		| { js: string }
		| { cjs: string }
		| { py: string }
		| { text: string }
		| { data: ArrayBuffer }
		| { json: object }
	>;
	globalOutbound?: ServiceBinding | null;
	env?: Record<string, unknown>;
}

interface WorkerStub {
	getEntrypoint(
		name?: string,
		options?: { props?: Record<string, unknown> },
	): unknown;
}

interface WorkerLoader {
	get(id: string, getCodeCallback: () => Promise<WorkerCode>): WorkerStub;
}

declare namespace Cloudflare {
	interface Env {
		DB: D1Database;
		FIRMWARES: R2Bucket;
		SCRIPTS: R2Bucket;
		CACHE: KVNamespace;
		GOOGLE_ID: string;
		GOOGLE_SECRET: string;
		SALT_TOKEN: string;
		DEVICE: DurableObjectNamespace;
		LOADER: WorkerLoader;
		ANALYTICS?: AnalyticsEngineDataset;
		USAGE?: AnalyticsEngineDataset;
		ENV: "local" | "production";
		// Cloudflare API credentials for reading back Analytics Engine via the
		// SQL API (metrics endpoints). Optional so the worker still boots without
		// them; the metrics endpoints return empty series when unset.
		// CLOUDFLARE_API_TOKEN reuses the same token the deploy workflow already
		// uses (GitHub secret of the same name); it needs Account Analytics: Read.
		CLOUDFLARE_ACCOUNT_ID?: string;
		CLOUDFLARE_API_TOKEN?: string;
		SENTRY_DSN: string | undefined;
		// Diagnostic toggle for the per-device DO `alarm()` / user-worker path.
		// "1" enables the (otherwise-zero-overhead) `[DIAG]`/`[DIAG2]` logging used
		// to root-cause "Too many subrequests" / alarm-wedge issues via `wrangler
		// tail` (see .claude/skills/debug-prod-worker-wedge). Unset/"0" in normal
		// operation; flip to "1" + redeploy when investigating. Plaintext var, not
		// a secret — it carries no sensitive data.
		DEVICE_DIAG_LOGS?: string;
	}
}
export interface Env extends Cloudflare.Env {}

export type tableUser = {
	id: string;
	name?: string;
	picture?: string;
	email: string;
	verified_email: number;
	plan: "free" | "paid";
	suspended_at?: number;
	deletion_requested_at?: number;
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
	qb: D1QB;
}

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
export type HandleArgs = [AppContext];

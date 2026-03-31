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
		GOOGLE_ID: string;
		GOOGLE_SECRET: string;
		SALT_TOKEN: string;
		DEVICE: DurableObjectNamespace;
		LOADER: WorkerLoader;
		ENV: "local" | "production";
		SENTRY_DSN: string;
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

export interface Variables {
	user: tableUser;
	qb: D1QB;
}

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
export type HandleArgs = [AppContext];

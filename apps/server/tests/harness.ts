import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { BunSqliteQB } from "../src/db/bunSqliteQB";
import { D1CompatDatabase } from "../src/db/d1Compat";
import { applyMigrations } from "../src/db/migrate";
import {
	createLogger,
	resetLogger,
	type ServerLogger,
} from "../src/foundation/logger";
import { app } from "../src/index";
import { installConsoleCapture } from "../src/runtime/consoleCapture";
import { DeviceHub } from "../src/runtime/deviceHub";
import { FsBlobStore } from "../src/storage/fsBlobStore";
import type { Env } from "../src/types";
import { websocket } from "../src/ws";

// console capture is a one-time global patch; installing it here makes the
// device-log path (console.* inside user handlers) exercise its real code in
// the e2e suite. The patch is a no-op outside runWithLogCapture scopes, so it
// never swallows test or server output.
installConsoleCapture();

const MIGRATIONS_DIR = new URL("../migrations", import.meta.url).pathname;

export interface ApiResponse<T = unknown> {
	status: number;
	ok: boolean;
	/** Parsed JSON body, or undefined when the body wasn't JSON. */
	body: T;
	text: string;
	headers: Headers;
}

export interface RequestOptions {
	token?: string;
	body?: unknown;
	headers?: Record<string, string>;
	query?: Record<string, string | number | undefined>;
	/** Send `body` verbatim instead of JSON.stringify (for malformed-input tests). */
	rawBody?: string;
}

export interface TestUser {
	token: string;
	user: { id: string; email: string; name?: string };
}

/**
 * A device-side WebSocket simulator: connects to the device `connect/websocket`
 * route, queues frames the server sends (commands), and lets a test reply to
 * them by id — the firmware's role, in TypeScript.
 */
export class DeviceSim {
	private ws: WebSocket;
	private queue: Record<string, unknown>[] = [];
	private waiters: Array<(m: Record<string, unknown>) => void> = [];
	closed = false;
	closeCode: number | null = null;
	closeReason = "";

	constructor(ws: WebSocket) {
		this.ws = ws;
		ws.addEventListener("message", (evt) => {
			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(String(evt.data));
			} catch {
				return;
			}
			const waiter = this.waiters.shift();
			if (waiter) waiter(parsed);
			else this.queue.push(parsed);
		});
		ws.addEventListener("close", (evt) => {
			this.closed = true;
			this.closeCode = evt.code;
			this.closeReason = evt.reason;
		});
	}

	/** Resolves once the socket is open (or rejects on error/timeout). */
	static async open(url: string, token: string): Promise<DeviceSim> {
		const ws = new WebSocket(url, {
			headers: { Authorization: `Bearer ${token}` },
		} as unknown as string[]);
		await new Promise<void>((resolve, reject) => {
			const t = setTimeout(
				() => reject(new Error("device ws open timeout")),
				5000,
			);
			ws.addEventListener("open", () => {
				clearTimeout(t);
				resolve();
			});
			ws.addEventListener("error", () => {
				clearTimeout(t);
				reject(new Error("device ws error"));
			});
		});
		return new DeviceSim(ws);
	}

	/** Raw device→server frame. */
	send(frame: Record<string, unknown>): void {
		this.ws.send(JSON.stringify(frame));
	}

	/** Announce a fresh connect, waking the user script's onDeviceConnect. */
	sendConnected(): void {
		this.send({ type: "device_connected", payload: {} });
	}

	/** Reply to a server command by echoing its id (resolves the REST caller). */
	respond(
		id: string,
		type: string,
		payload: Record<string, unknown> = {},
	): void {
		this.send({ id, type, payload });
	}

	/** Next frame the server pushed to the device (command), oldest first. */
	nextCommand(timeoutMs = 5000): Promise<Record<string, unknown>> {
		const queued = this.queue.shift();
		if (queued) return Promise.resolve(queued);
		return new Promise((resolve, reject) => {
			const t = setTimeout(
				() => reject(new Error("timed out waiting for device command")),
				timeoutMs,
			);
			this.waiters.push((m) => {
				clearTimeout(t);
				resolve(m);
			});
		});
	}

	/**
	 * Auto-acks the next command: waits for it, then replies with `type` echoing
	 * the command id. Returns the original command.
	 */
	async ackNext(
		responseType = "command_result",
		payload: Record<string, unknown> = {},
	): Promise<Record<string, unknown>> {
		const cmd = await this.nextCommand();
		this.respond(String(cmd.id), responseType, payload);
		return cmd;
	}

	/**
	 * Begins auto-acking every command the server pushes: each frame with an `id`
	 * gets a reply echoing that id, so user-script `sendCommandAndWait` calls
	 * resolve. Returns a stop function. Frames already queued are drained too.
	 */
	startAutoAck(
		responseType = "command_result",
		payload: Record<string, unknown> = {},
	): () => void {
		let stopped = false;
		const pump = async () => {
			while (!stopped && !this.closed) {
				let cmd: Record<string, unknown>;
				try {
					cmd = await this.nextCommand(60_000);
				} catch {
					return;
				}
				if (stopped) return;
				if (cmd.id !== undefined) {
					this.respond(String(cmd.id), responseType, payload);
				}
			}
		};
		void pump();
		return () => {
			stopped = true;
		};
	}

	async close(code = 1000, reason = "test done"): Promise<void> {
		if (this.ws.readyState === WebSocket.CLOSED) return;
		await new Promise<void>((resolve) => {
			this.ws.addEventListener("close", () => resolve());
			this.ws.close(code, reason);
			setTimeout(resolve, 1000);
		});
	}
}

/**
 * A watcher-side WebSocket simulator: collects the `{event,data}` frames the
 * watch route streams (status/log/state/history_complete).
 */
export class WatcherSim {
	private ws: WebSocket;
	events: Array<{ event: string; data?: unknown; replay?: boolean }> = [];
	private waiters: Array<() => void> = [];

	constructor(ws: WebSocket) {
		this.ws = ws;
		ws.addEventListener("message", (evt) => {
			try {
				this.events.push(JSON.parse(String(evt.data)));
			} catch {
				return;
			}
			const w = this.waiters.shift();
			if (w) w();
		});
	}

	static async open(url: string, token: string): Promise<WatcherSim> {
		const ws = new WebSocket(url, {
			headers: { Authorization: `Bearer ${token}` },
		} as unknown as string[]);
		await new Promise<void>((resolve, reject) => {
			const t = setTimeout(
				() => reject(new Error("watcher ws open timeout")),
				5000,
			);
			ws.addEventListener("open", () => {
				clearTimeout(t);
				resolve();
			});
			ws.addEventListener("error", () => {
				clearTimeout(t);
				reject(new Error("watcher ws error"));
			});
		});
		return new WatcherSim(ws);
	}

	/** Waits until `predicate` matches one of the received events. */
	async waitFor(
		predicate: (e: {
			event: string;
			data?: unknown;
			replay?: boolean;
		}) => boolean,
		timeoutMs = 5000,
	): Promise<{ event: string; data?: unknown; replay?: boolean }> {
		const found = this.events.find(predicate);
		if (found) return found;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await new Promise<void>((resolve) => {
				const t = setTimeout(resolve, 100);
				this.waiters.push(() => {
					clearTimeout(t);
					resolve();
				});
			});
			const hit = this.events.find(predicate);
			if (hit) return hit;
		}
		throw new Error("timed out waiting for watcher event");
	}

	close(): void {
		this.ws.close();
	}
}

export class TestServer {
	readonly services: Env;
	readonly db: Database;
	readonly baseUrl: string;
	readonly wsBase: string;
	private server: ReturnType<typeof Bun.serve>;
	private dataDir: string;
	private logger: ServerLogger;

	private constructor(opts: {
		services: Env;
		db: Database;
		server: ReturnType<typeof Bun.serve>;
		dataDir: string;
		logger: ServerLogger;
	}) {
		this.services = opts.services;
		this.db = opts.db;
		this.server = opts.server;
		this.dataDir = opts.dataDir;
		this.logger = opts.logger;
		const port = opts.server.port;
		this.baseUrl = `http://localhost:${port}`;
		this.wsBase = `ws://localhost:${port}`;
	}

	/** Boots an isolated server: fresh temp data dir, migrated DB, ephemeral port. */
	static async start(
		envOverrides: Record<string, string> = {},
	): Promise<TestServer> {
		const dataDir = mkdtempSync(join(tmpdir(), "dsdk-e2e-"));
		const config = loadConfig({
			DATA_DIR: dataDir,
			ENV: "local",
			MDNS_ENABLED: "0",
			PORT: "0",
			// Tests run many register/login requests through Bun.serve's test fetch,
			// which has no reliable socket IP. Trust forwarded headers so the harness
			// can assign a unique source IP per request and avoid tripping the global
			// rate limiter.
			TRUST_PROXY: "true",
			MIGRATIONS_DIR,
			...envOverrides,
		});
		const db = new Database(config.dbPath, { create: true });
		db.exec("PRAGMA journal_mode = WAL;");
		db.exec("PRAGMA foreign_keys = ON;");
		applyMigrations(db, config.migrationsDir);
		const qb = new BunSqliteQB(db);
		const scripts = new FsBlobStore(config.scriptsDir);
		const firmwares = new FsBlobStore(config.firmwaresDir);
		const logger = createLogger(config);
		const hub = new DeviceHub({ db, scripts, logger });
		hub.resetConnectionState();

		const services: Env = {
			SCRIPTS: scripts,
			FIRMWARES: firmwares,
			DEVICE: hub,
			qb,
			DB: new D1CompatDatabase(db),
			ENV: config.env,
			config,
			server: undefined,
		};

		const server = Bun.serve({
			port: 0,
			fetch: (req) => app.fetch(req, services),
			websocket,
		});
		services.server = server;

		return new TestServer({ services, db, server, dataDir, logger });
	}

	async request<T = unknown>(
		method: string,
		path: string,
		opts: RequestOptions = {},
	): Promise<ApiResponse<T>> {
		const url = new URL(path, this.baseUrl);
		if (opts.query) {
			for (const [k, v] of Object.entries(opts.query)) {
				if (v !== undefined) url.searchParams.set(k, String(v));
			}
		}
		const headers: Record<string, string> = { ...opts.headers };
		// Tests run with TRUST_PROXY=true so the rate limiter honors forwarded
		// headers. Give each request a unique source IP by default so incidental
		// register/login traffic across TestServers never trips the global limiter;
		// rate-limit tests pass an explicit `X-Forwarded-For` to opt back in.
		if (
			headers["X-Forwarded-For"] === undefined &&
			headers["x-forwarded-for"] === undefined
		) {
			headers["X-Forwarded-For"] = `10.${rand255()}.${rand255()}.${rand255()}`;
		}
		if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
		let bodyInit: string | undefined;
		if (opts.rawBody !== undefined) {
			bodyInit = opts.rawBody;
			headers["Content-Type"] ??= "application/json";
		} else if (opts.body !== undefined) {
			bodyInit = JSON.stringify(opts.body);
			headers["Content-Type"] ??= "application/json";
		}
		const res = await this.server.fetch(
			new Request(url, { method, headers, body: bodyInit }),
		);
		const text = await res.text();
		let body: T;
		try {
			body = JSON.parse(text) as T;
		} catch {
			body = undefined as T;
		}
		return { status: res.status, ok: res.ok, body, text, headers: res.headers };
	}

	get(path: string, opts?: RequestOptions) {
		return this.request("GET", path, opts);
	}
	post(path: string, opts?: RequestOptions) {
		return this.request("POST", path, opts);
	}
	put(path: string, opts?: RequestOptions) {
		return this.request("PUT", path, opts);
	}
	patch(path: string, opts?: RequestOptions) {
		return this.request("PATCH", path, opts);
	}
	delete(path: string, opts?: RequestOptions) {
		return this.request("DELETE", path, opts);
	}

	/** Registers a local account and returns a usable bearer (session) token. */
	async register(
		creds: { email: string; password?: string; name?: string } = {
			email: `user-${crypto.randomUUID()}@example.com`,
		},
	): Promise<TestUser> {
		const password = creds.password ?? "password123";
		const res = await this.post("/v1/auth/register", {
			body: { email: creds.email, password, name: creds.name },
		});
		if (res.status !== 200) {
			throw new Error(`register failed: ${res.status} ${res.text}`);
		}
		const token = extractSessionToken(res.headers);
		if (!token) throw new Error("no session cookie returned from register");
		const user = (res.body as { result: TestUser["user"] }).result;
		return { token, user };
	}

	/** Logs in an existing account, returning its session token. */
	async login(email: string, password = "password123"): Promise<string> {
		const res = await this.post("/v1/auth/login", {
			body: { email, password },
		});
		if (res.status !== 200) {
			throw new Error(`login failed: ${res.status} ${res.text}`);
		}
		const token = extractSessionToken(res.headers);
		if (!token) throw new Error("no session cookie returned from login");
		return token;
	}

	/** Convenience: register a user + create a project + device under it. */
	async scaffold(opts?: {
		projectSlug?: string;
		deviceSlug?: string;
	}): Promise<{
		auth: TestUser;
		projectSlug: string;
		deviceSlug: string;
		projectId: string;
		deviceId: string;
	}> {
		const auth = await this.register();
		const projectSlug = opts?.projectSlug ?? "proj";
		const deviceSlug = opts?.deviceSlug ?? "dev";
		const proj = await this.post("/v1/projects", {
			token: auth.token,
			body: { project_slug: projectSlug, name: "Test Project" },
		});
		if (proj.status !== 201) throw new Error(`scaffold project: ${proj.text}`);
		const dev = await this.post(`/v1/projects/${projectSlug}/devices`, {
			token: auth.token,
			body: { device_id: deviceSlug, name: "Test Device" },
		});
		if (dev.status !== 201) throw new Error(`scaffold device: ${dev.text}`);
		return {
			auth,
			projectSlug,
			deviceSlug,
			projectId: (proj.body as { result: { id: string } }).result.id,
			deviceId: (dev.body as { result: { id: string } }).result.id,
		};
	}

	deviceWsUrl(
		projectSlug: string,
		deviceSlug: string,
		versionId = "latest",
	): string {
		return `${this.wsBase}/v1/projects/${projectSlug}/devices/${deviceSlug}/connect/websocket?versionId=${versionId}`;
	}

	watchWsUrl(
		projectSlug: string,
		deviceSlug: string,
		query: Record<string, string | number> = {},
	): string {
		const qs = new URLSearchParams(
			Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
		).toString();
		return `${this.wsBase}/v1/projects/${projectSlug}/devices/${deviceSlug}/watch${qs ? `?${qs}` : ""}`;
	}

	connectDevice(
		token: string,
		projectSlug: string,
		deviceSlug: string,
		versionId = "latest",
	): Promise<DeviceSim> {
		return DeviceSim.open(
			this.deviceWsUrl(projectSlug, deviceSlug, versionId),
			token,
		);
	}

	connectWatcher(
		token: string,
		projectSlug: string,
		deviceSlug: string,
		query: Record<string, string | number> = {},
	): Promise<WatcherSim> {
		return WatcherSim.open(
			this.watchWsUrl(projectSlug, deviceSlug, query),
			token,
		);
	}

	async stop(): Promise<void> {
		try {
			this.server.stop(true);
		} catch {
			/* already stopped */
		}
		try {
			this.db.close();
		} catch {
			/* already closed */
		}
		try {
			await this.logger.close();
		} catch {
			/* already closed */
		}
		resetLogger();
		try {
			rmSync(this.dataDir, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	}
}

/** Random octet 1..254 for synthesizing unique client IPs. */
function rand255(): number {
	return 1 + Math.floor(Math.random() * 254);
}

/** Pull the session token value out of a Set-Cookie header. */
function extractSessionToken(headers: Headers): string | null {
	const raw = headers.get("set-cookie");
	if (!raw) return null;
	const match = raw.match(/devicesdk-session=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * A minimal valid device-script bundle: a class with the standard lifecycle
 * hooks plus an RPC-callable method. `entrypoint` is the exported name.
 */
export function deviceScriptSource(entrypoint = "Entry"): string {
	return `
export class ${entrypoint} {
	constructor(ctx, env) {
		this.env = env;
		this.messages = [];
	}
	async onDeviceConnect() {
		console.log("device connected");
	}
	async onDeviceDisconnect() {
		console.log("device disconnected");
	}
	async onMessage(message) {
		this.messages.push(message);
		console.info("message", message.type);
	}
	get crons() { return {}; }
	async echo(value) { return value; }
	async readVar(key) { return await this.env.VARS.get(key); }
}
`;
}

/** A script source that defines a cron firing every minute. */
export function cronScriptSource(
	entrypoint = "CronEntry",
	expr = "* * * * *",
): string {
	return `
export class ${entrypoint} {
	constructor(ctx, env) { this.env = env; }
	async onDeviceConnect() {}
	get crons() { return { tick: ${JSON.stringify(expr)} }; }
	async onCron(name) { console.log("cron fired", name); }
}
`;
}

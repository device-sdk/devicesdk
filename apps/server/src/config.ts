import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ServerConfig {
	/** HTTP port serving API + WebSockets + dashboard SPA. */
	port: number;
	/** Root for all persistent state (SQLite DB, scripts, firmwares). */
	dataDir: string;
	/** "local" enables dev-friendly behavior (CORS for quasar dev, etc.). */
	env: "local" | "production";
	/** Allow new account registration (first account is always allowed). */
	allowRegistration: boolean;
	/** Set Secure on session cookies (enable when serving behind TLS). */
	secureCookies: boolean;
	/** Directory with built dashboard SPA to serve at /; empty disables. */
	publicDir: string;
	/** Directory with bundled firmware binaries used to seed the data dir. */
	firmwaresDistDir: string;
	/** Advertise this server over mDNS as `<mdnsHostname>.local` for device discovery. */
	mdnsEnabled: boolean;
	/** Short mDNS hostname (no `.local`); override to run multiple servers on one LAN. */
	mdnsHostname: string;
	/**
	 * Trust X-Forwarded-For / X-Real-IP headers. Enable only when the server is
	 * behind a reverse proxy; otherwise clients can spoof their IP and bypass
	 * the brute-force rate limiter.
	 */
	trustProxy: boolean;
	/** Absolute path to the server log file. */
	logFile: string;
	dbPath: string;
	scriptsDir: string;
	firmwaresDir: string;
	migrationsDir: string;
	/**
	 * Server-side secret used for HMAC-SHA-256 hashing of API/CLI tokens.
	 * Prefer the API_TOKEN_SECRET env var; when omitted a random secret is
	 * generated once and persisted under DATA_DIR so token hashes remain
	 * stable across restarts.
	 */
	apiTokenSecret: string;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === "") return fallback;
	return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function loadOrCreateApiTokenSecret(
	env: Record<string, string | undefined>,
	dataDir: string,
): string {
	const fromEnv = env.API_TOKEN_SECRET;
	if (fromEnv && fromEnv.length > 0) return fromEnv;

	mkdirSync(dataDir, { recursive: true });
	const secretPath = join(dataDir, ".api-token-secret");
	if (existsSync(secretPath)) {
		const persisted = readFileSync(secretPath, "utf-8").trim();
		if (persisted.length > 0) return persisted;
		// File exists but is empty/corrupt: regenerate below.
	}

	const secret = randomBytes(32).toString("hex");
	writeFileSync(secretPath, secret, { mode: 0o600 });
	return secret;
}

export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): ServerConfig {
	const dataDir = env.DATA_DIR || "./data";
	const envName = env.ENV === "local" ? "local" : "production";
	return {
		port: Number.parseInt(env.PORT || "8080", 10),
		dataDir,
		env: envName,
		allowRegistration: parseBool(env.ALLOW_REGISTRATION, true),
		secureCookies: parseBool(env.SECURE_COOKIES, false),
		publicDir: env.PUBLIC_DIR || "",
		firmwaresDistDir: env.FIRMWARES_DIST_DIR || "",
		mdnsEnabled: parseBool(env.MDNS_ENABLED, true),
		mdnsHostname: env.MDNS_HOSTNAME || "devicesdk",
		trustProxy: parseBool(env.TRUST_PROXY, false),
		logFile: env.LOG_FILE || join(dataDir, "server.log"),
		dbPath: join(dataDir, "devicesdk.sqlite"),
		scriptsDir: join(dataDir, "scripts"),
		firmwaresDir: join(dataDir, "firmwares"),
		// Overridable because the Docker image runs a bundled server.js whose
		// import.meta.url no longer sits next to the migrations directory.
		migrationsDir:
			env.MIGRATIONS_DIR || new URL("../migrations", import.meta.url).pathname,
		apiTokenSecret: loadOrCreateApiTokenSecret(env, dataDir),
	};
}

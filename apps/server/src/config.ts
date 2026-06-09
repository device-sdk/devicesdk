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
	dbPath: string;
	scriptsDir: string;
	firmwaresDir: string;
	migrationsDir: string;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === "") return fallback;
	return !["0", "false", "no", "off"].includes(value.toLowerCase());
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
		dbPath: join(dataDir, "devicesdk.sqlite"),
		scriptsDir: join(dataDir, "scripts"),
		firmwaresDir: join(dataDir, "firmwares"),
		migrationsDir: new URL("../migrations", import.meta.url).pathname,
	};
}

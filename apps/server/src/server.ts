import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { loadConfig } from "./config";
import { BunSqliteQB } from "./db/bunSqliteQB";
import { D1CompatDatabase } from "./db/d1Compat";
import { applyMigrations } from "./db/migrate";
import { createLogger, type ServerLogger } from "./foundation/logger";
import { startMdnsResponder } from "./foundation/mdns/responder";
import { app } from "./index";
import { startJanitor } from "./janitor";
import { installConsoleCapture } from "./runtime/consoleCapture";
import { DeviceHub } from "./runtime/deviceHub";
import { FsBlobStore } from "./storage/fsBlobStore";
import type { Env } from "./types";
import { websocket } from "./ws";

const config = loadConfig();
const logger: ServerLogger = createLogger(config);

mkdirSync(config.dataDir, { recursive: true });

// --- database ---
const db = new Database(config.dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
const applied = applyMigrations(db, config.migrationsDir);
if (applied.length > 0) {
	logger.info(`Applied ${applied.length} database migration(s)`, {
		migrations: applied,
	});
}
const qb = new BunSqliteQB(db);

// --- blob stores ---
const scripts = new FsBlobStore(config.scriptsDir);
const firmwares = new FsBlobStore(config.firmwaresDir);

// Seed firmware binaries bundled in the image into the data dir (first boot
// or after an image upgrade adds new targets; existing files are replaced so
// upgrades ship fresh binaries).
if (config.firmwaresDistDir && existsSync(config.firmwaresDistDir)) {
	cpSync(config.firmwaresDistDir, config.firmwaresDir, { recursive: true });
}

// --- device runtime ---
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

installConsoleCapture();
startJanitor(qb);

const server = Bun.serve({
	port: config.port,
	fetch: (req) => app.fetch(req, services),
	websocket,
});
// hono's bun adapter resolves the server from c.env.server for WS upgrades.
services.server = server;

logger.info(`DeviceSDK server listening on http://localhost:${server.port}`, {
	dataDir: config.dataDir,
	env: config.env,
});

// Advertise `<mdnsHostname>.local` so LAN devices can resolve this server
// without a static IP. Devices flashed with e.g. `devicesdk.local:8080` find us
// over mDNS. Disable with MDNS_ENABLED=0; rename with MDNS_HOSTNAME=… to run
// several servers on one network.
const mdns = config.mdnsEnabled
	? startMdnsResponder({ hostname: config.mdnsHostname })
	: undefined;

// Graceful shutdown - send the mDNS goodbye so caches evict us promptly.
let shuttingDown = false;
function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info("Shutting down", { signal });
	mdns?.stop();
	server.stop();
	process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Crash protection: log unhandled rejections so floating promises (DB writes,
// mDNS callbacks, etc.) don't fail silently, and exit on uncaught exceptions
// to avoid running in a potentially corrupted state.
process.on("unhandledRejection", (reason, _promise) => {
	logger.error(
		reason instanceof Error ? reason : new Error(String(reason)),
		"Unhandled promise rejection",
		{ reason: reason instanceof Error ? reason.message : String(reason) },
	);
});
process.on("uncaughtException", (error) => {
	logger.error(error, "Uncaught exception - exiting");
	process.exit(1);
});

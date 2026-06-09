import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { loadConfig } from "./config";
import { BunSqliteQB } from "./db/bunSqliteQB";
import { D1CompatDatabase } from "./db/d1Compat";
import { applyMigrations } from "./db/migrate";
import { logger } from "./foundation/logger";
import { app } from "./index";
import { startJanitor } from "./janitor";
import { DeviceHub } from "./runtime/deviceHub";
import { FsBlobStore } from "./storage/fsBlobStore";
import type { Env } from "./types";

const config = loadConfig();

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
const hub = new DeviceHub({ qb, scripts });
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

startJanitor(qb);

const server = Bun.serve({
	port: config.port,
	fetch: (req) => app.fetch(req, services),
	// Populated in Phase 2 by createBunWebSocket's handler (device + watcher sockets).
	websocket: {
		message() {},
		open() {},
		close() {},
	},
});
// hono's bun adapter resolves the server from c.env.server for WS upgrades.
services.server = server;

logger.info(`DeviceSDK server listening on http://localhost:${server.port}`, {
	dataDir: config.dataDir,
	env: config.env,
});

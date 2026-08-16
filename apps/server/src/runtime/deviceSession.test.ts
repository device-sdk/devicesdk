import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ServerLogger } from "../foundation/logger";
import { FsBlobStore } from "../storage/fsBlobStore";
import { DeviceSession, type SessionDeps } from "./deviceSession";
import type { RuntimeSocket } from "./types";

// attachWatcher sends the initial status, the oldest-first backfill replay,
// and history_complete as one guarded sequence. Regression coverage for the
// unfixed PR state where the replay + marker sends sat outside any try/catch:
// a watcher that disconnected between registration and replay made ws.send
// throw out of the watch route's onOpen handler and left a dead socket
// registered forever.

const watchersSize = (session: DeviceSession): number =>
	(session as unknown as { watchers: Set<RuntimeSocket> }).watchers.size;

describe("DeviceSession watcher attach", () => {
	let dir: string;
	let db: Database;
	let deps: SessionDeps;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "dsdk-session-"));
		db = new Database(":memory:");
		db.exec(
			`CREATE TABLE device_logs (
				id TEXT PRIMARY KEY,
				device_id TEXT,
				level TEXT,
				message TEXT,
				created_at INTEGER
			)`,
		);
		deps = {
			db,
			scripts: new FsBlobStore(join(dir, "scripts")),
			logger: new ServerLogger({
				logFile: join(dir, "server.log"),
				mirrorToConsole: false,
			}),
			makeBridge: () => async () => {
				throw new Error("bridge not used in this test");
			},
		};
	});

	afterAll(() => {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	});

	function seedLogs(deviceId: string, count: number, startAt: number): void {
		for (let i = 0; i < count; i++) {
			db.query(
				"INSERT INTO device_logs (id, device_id, level, message, created_at) VALUES (?1, ?2, 'info', ?3, ?4)",
			).run(crypto.randomUUID(), deviceId, `log-${i}`, startAt + i);
		}
	}

	test("healthy watcher receives status, oldest-first replay, then history_complete", () => {
		const session = new DeviceSession("proj", "dev-order", deps);
		seedLogs("dev-order", 3, 1000);

		const frames: string[] = [];
		const healthy: RuntimeSocket = {
			send: (d) => frames.push(d),
			close: () => {},
		};
		session.attachWatcher(healthy, { backfillLimit: 10 });

		expect(frames[0]).toContain('"status"');
		const events = frames.map((f) => {
			const parsed = JSON.parse(f) as { event: string; data?: unknown };
			return parsed.event;
		});
		// oldest first: log-0 before log-1 before log-2, marker last
		expect(events).toEqual(["status", "log", "log", "log", "history_complete"]);
		const replayed = frames.slice(1, 4).map((f) => {
			const parsed = JSON.parse(f) as {
				data: { message: string };
				replay: boolean;
			};
			return `${parsed.data.message}:${parsed.replay}`;
		});
		expect(replayed).toEqual(["log-0:true", "log-1:true", "log-2:true"]);
		expect(watchersSize(session)).toBe(1);
	});

	test("a socket that dies mid-replay does not throw out of attachWatcher and is detached", () => {
		const session = new DeviceSession("proj", "dev-mid", deps);
		seedLogs("dev-mid", 2, 2000);

		let sends = 0;
		const frames: string[] = [];
		const deadMidReplay: RuntimeSocket = {
			send: (d) => {
				sends++;
				// status succeeds, the first replay frame explodes
				if (sends > 1) throw new Error("socket closed");
				frames.push(d);
			},
			close: () => {},
		};

		expect(() =>
			session.attachWatcher(deadMidReplay, { backfillLimit: 10 }),
		).not.toThrow();
		// replayed only as far as the failure point, then detached
		expect(sends).toBe(2);
		expect(frames[0]).toContain('"status"');
		expect(watchersSize(session)).toBe(0);
	});

	test("an already-dead socket (send always throws) is detached without throwing, no backfill", () => {
		const session = new DeviceSession("proj", "dev-dead", deps);
		const dead: RuntimeSocket = {
			send: () => {
				throw new Error("socket closed");
			},
			close: () => {},
		};

		expect(() => session.attachWatcher(dead, {})).not.toThrow();
		expect(watchersSize(session)).toBe(0);
	});
});

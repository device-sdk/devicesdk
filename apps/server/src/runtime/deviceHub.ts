import type { Database } from "bun:sqlite";
import type { DeviceCommand } from "@devicesdk/core";
import type { ServerLogger } from "../foundation/logger";
import type { FsBlobStore } from "../storage/fsBlobStore";
import { DeviceSession } from "./deviceSession";
import { makeBridge } from "./devicesBridge";

/**
 * The per-device surface the REST endpoints call — the same method names the
 * Durable Object stub used to expose, so endpoint call sites are unchanged.
 */
export interface DeviceHandle {
	getConnectionStatus(): Promise<{
		connected: boolean;
		connectedSince: number | null;
	}>;
	handleCommand(
		command: Omit<DeviceCommand, "id">,
	): Promise<{ status: number; body: string }>;
	triggerRebootForDeploy(): Promise<{ rebooted: boolean; reason: string }>;
}

export interface DeviceHubDeps {
	db: Database;
	scripts: FsBlobStore;
	logger: ServerLogger;
}

/**
 * Registry of device sessions, keyed `${projectId}:${deviceId}` (the same
 * identity the Durable Object namespace used). Replaces the DO: instead of
 * resolving a stub, callers get the in-process DeviceSession. Sessions are
 * created lazily on first touch and live for the process lifetime — they're
 * small, and a session with no live socket still serves watchers and RPC.
 */
export class DeviceHub {
	private deps: DeviceHubDeps;
	private sessions = new Map<string, DeviceSession>();

	constructor(deps: DeviceHubDeps) {
		this.deps = deps;
	}

	/** Mark all devices disconnected — sessions don't survive a restart. */
	resetConnectionState(): void {
		this.deps.db.query("UPDATE devices SET connected = 0").run();
	}

	get(projectId: string, deviceId: string): DeviceSession {
		const key = `${projectId}:${deviceId}`;
		let session = this.sessions.get(key);
		if (!session) {
			session = new DeviceSession(projectId, deviceId, {
				db: this.deps.db,
				scripts: this.deps.scripts,
				logger: this.deps.logger,
				makeBridge: (meta) =>
					makeBridge(
						{
							db: this.deps.db,
							getSession: (pid, did) => this.get(pid, did),
						},
						meta,
					),
			});
			this.sessions.set(key, session);
		}
		return session;
	}
}

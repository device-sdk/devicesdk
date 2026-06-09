import type { DeviceCommand } from "@devicesdk/core";
import type { BunSqliteQB } from "../db/bunSqliteQB";
import type { FsBlobStore } from "../storage/fsBlobStore";

/**
 * The per-device surface the REST endpoints call — the same method names the
 * Durable Object stub used to expose, so endpoint call sites are unchanged.
 * Phase 2 backs this with live DeviceSession WebSocket state; until then the
 * hub answers as "device not connected".
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
	qb: BunSqliteQB;
	scripts: FsBlobStore;
}

/**
 * Registry of live device sessions, keyed `${projectId}:${deviceId}` — the
 * same identity the Durable Object namespace used. Replaces the DO: instead
 * of resolving a stub, callers get an in-process handle.
 */
export class DeviceHub {
	private deps: DeviceHubDeps;

	constructor(deps: DeviceHubDeps) {
		this.deps = deps;
	}

	/** Mark all devices disconnected — sessions don't survive a restart. */
	resetConnectionState(): void {
		this.deps.qb.db.query("UPDATE devices SET connected = 0").run();
	}

	get(projectId: string, deviceId: string): DeviceHandle {
		// Phase 1: no live sessions yet — every device reports disconnected.
		// Phase 2 returns the live DeviceSession when one is registered.
		void projectId;
		void deviceId;
		return {
			async getConnectionStatus() {
				return { connected: false, connectedSince: null };
			},
			async handleCommand() {
				return { status: 503, body: "Device not connected" };
			},
			async triggerRebootForDeploy() {
				return { rebooted: false, reason: "Device not connected" };
			},
		};
	}
}

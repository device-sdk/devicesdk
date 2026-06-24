import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";

/**
 * The wrapper surface the runtime drives on a loaded user script - same
 * contract the Worker Loader proxy entrypoint used to return, now produced
 * in-process by scriptHost.ts.
 */
export interface IUserDeviceWorker {
	onDeviceConnect(): Promise<void>;
	onDeviceDisconnect(): Promise<void>;
	onMessage(message: DeviceResponse): Promise<void>;
	onAlarm?(): Promise<void>;
	getCrons(): Promise<Record<string, string>>;
	onCron(name: string): Promise<void>;
	callMethod(
		name: string,
		args: unknown[],
		callDepth?: number,
	): Promise<unknown>;
}

/** KV storage interface exposed to user code as DEVICE.kv. */
export interface KVInterface {
	get<T = unknown>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
}

/** Connection metadata captured when a device connects (server-derived). */
export interface DeviceMeta {
	userId: string;
	projectId: string;
	deviceId: string;
	/**
	 * Slugs are what uploadScript/getScript/deployVersion use as the script
	 * blob key prefix - the projectId/deviceId fields above are UUIDs and do
	 * NOT match any blob key.
	 */
	projectSlug: string;
	deviceSlug: string;
	versionId: string;
	entrypointName: string;
}

/** Minimal socket surface the runtime needs (satisfied by hono's WSContext). */
export interface RuntimeSocket {
	send(data: string): void;
	close(code?: number, reason?: string): void;
}

export interface LogEntry {
	id: string;
	level: string;
	message: string;
	created_at: number;
}

export type { DeviceCommand, DeviceResponse };

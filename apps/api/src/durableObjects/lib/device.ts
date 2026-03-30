import { DurableObject } from "cloudflare:workers";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
} from "@devicesdk/core";
import { z } from "zod";
import {
	LOG_CLEANUP_INTERVAL,
	LOG_MAX_STORED,
	LOG_MESSAGE_MAX_LENGTH,
	LOG_RETENTION_MS,
	type LogLevel,
	VALID_LOG_LEVELS,
} from "../../foundation/consts";
import type { Env } from "../../types";
import { getProxyEntrypoint } from "./classProxy";
import { type CronStorage, resolveDueCrons } from "./cronDispatch";
import { nextCronTime } from "./cronParser";
import type { IUserDeviceWorker } from "./userWorkerTypes";

const DeviceMessageSchema = z.object({
	id: z.string().max(64).optional().default(""),
	type: z.string().max(64),
	payload: z.record(z.unknown()).optional().default({}),
});

// Storage key for persisted cron schedule state.
// Uses the __internal: prefix which is blocked in kvPut/kvGet/kvDelete so user
// code cannot accidentally corrupt scheduler state.
export const CRON_STORAGE_KEY = "__internal:cron_schedules";

/** Returns the earliest nextFireAt across all schedules. */
function earliestFireTime(schedules: CronStorage): number {
	return Object.values(schedules).reduce(
		(min, s) => Math.min(min, s.nextFireAt),
		Infinity,
	);
}

// Storage key for the WebSocket connection timestamp.
// Written on connect and deleted on disconnect. Not currently read back — the
// in-memory `_connectedSince` field is used for live requests. This persists
// to durable storage so that a future hibernation-recovery path can restore
// the connection timestamp without requiring the client to reconnect.
export const CONNECTED_SINCE_KEY = "__internal:connectedSince";

// Prefix reserved for internal DO storage keys; blocked from user-facing kv API
const INTERNAL_KEY_PREFIX = "__internal:";

// Represents the WebSocket connection to the device.
interface DeviceSession {
	websocket: WebSocket;
}

// Structure to hold pending command promises
interface PendingCommand {
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
	timeoutId: any;
}

export class BaseDevice extends DurableObject<Env> {
	private static readonly MAX_PENDING_COMMANDS = 100;
	private _session?: DeviceSession;
	private pendingCommands: Map<string, PendingCommand> = new Map();
	private logWriteCount = 0;
	private logsTableReady = false;
	// In-memory only — cosmetic field, not durable. Avoids a storage write on the hot path.
	private _connectedSince?: number;

	// Device metadata from connection
	private deviceMeta?: {
		userId: string;
		projectId: string;
		versionId: string;
		deviceId: string;
		entrypointName: string;
	};

	/**
	 * Gets the current WebSocket session, restoring it from hibernation if necessary.
	 */
	protected getSession(): DeviceSession | undefined {
		if (this._session) {
			return this._session;
		}

		const sockets = this.ctx.getWebSockets();
		console.log("sockets ", sockets);
		if (sockets.length > 0) {
			console.log("Restoring session from hibernation.");
			this._session = { websocket: sockets[0] };
			return this._session;
		}

		return undefined;
	}

	async fetch(request: Request) {
		const url = new URL(request.url);

		if (url.pathname.endsWith("/websocket")) {
			return this.handleWebSocketUpgrade(request);
		}
		// POST handler removed — commands use WebSocket RPC only
		return new Response("Not found", { status: 404 });
	}

	/**
	 * Handles the initial WebSocket connection from the device.
	 */
	async handleWebSocketUpgrade(request: Request) {
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader !== "websocket") {
			return new Response("Expected Upgrade: websocket", { status: 426 });
		}

		// Extract project/version/device info from URL
		const url = new URL(request.url);
		const userId = url.searchParams.get("userId");
		const projectId = url.searchParams.get("projectId");
		const versionId = url.searchParams.get("versionId");
		const deviceId = url.searchParams.get("deviceId");
		const entrypointName = url.searchParams.get("entrypointName");

		if (!userId || !projectId || !deviceId || !versionId || !entrypointName) {
			return new Response("Missing userId or projectId", { status: 400 });
		}

		this.deviceMeta = {
			userId,
			projectId,
			versionId,
			deviceId,
			entrypointName,
		};

		// Store deviceMeta in DO storage so it persists through hibernation
		await this.ctx.storage.put("deviceMeta", this.deviceMeta);

		const [client, server] = Object.values(new WebSocketPair());

		this.ctx.acceptWebSocket(server);
		this._session = { websocket: server };
		this._connectedSince = Date.now();

		await this.ctx.storage.put(CONNECTED_SINCE_KEY, Date.now());

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	/**
	 * Gets device metadata, restoring from storage if needed (e.g., after hibernation)
	 */
	private async getDeviceMeta(): Promise<typeof this.deviceMeta> {
		if (this.deviceMeta) {
			return this.deviceMeta;
		}

		// Restore from storage after hibernation
		const stored =
			await this.ctx.storage.get<typeof this.deviceMeta>("deviceMeta");
		if (stored) {
			this.deviceMeta = stored;
		}
		return this.deviceMeta;
	}

	/**
	 * Gets or creates the user worker, restoring it after hibernation if needed
	 */
	private async getOrCreateUserWorker(): Promise<IUserDeviceWorker> {
		const deviceMeta = await this.getDeviceMeta();
		if (!deviceMeta) {
			throw new Error(
				"Failed to create user worker, because deviceMeta is empty",
			);
		}

		const { userId, projectId, versionId, deviceId, entrypointName } =
			deviceMeta;
		const workerId = `${projectId}:${deviceId}:${versionId}:${crypto.randomUUID()}`;

		try {
			// TODO: There is a known bug (EW-9769) when a dynamic worker is created in a DO in one request
			// and then used in a different request. The workaround is to call LOADER.get() again immediately
			// before use instead of reusing the cached worker. This will be fixed soon, after which we can
			// go back to caching the worker instance.
			// Get the dynamic worker using the loader
			const worker = this.env.LOADER.get(workerId, async () => {
				// Fetch user code from R2 using new path structure: /{userId}/{projectId}/{deviceId}/{versionId}.js
				const scriptKey = `${userId}/${projectId}/${deviceId}/${versionId}.js`;
				const scriptObject = await this.env.SCRIPTS.get(scriptKey);

				if (!scriptObject) {
					throw new Error(`Script not found in R2: ${scriptKey}`);
				}

				const userCode = await scriptObject.text();

				// Fetch project env vars from D1 to inject into the sandbox
				const envVarsResult = await this.env.DB.prepare(
					"SELECT key, value FROM project_env_vars WHERE project_id = ?",
				)
					.bind(projectId)
					.all<{ key: string; value: string }>();
				const envVarsMap: Record<string, string> = Object.fromEntries(
					(envVarsResult.results ?? []).map((r) => [r.key, r.value]),
				);

				return {
					compatibilityDate: "2025-11-25",
					mainModule: "main.js",
					modules: {
						"device.js": userCode,
						"main.js": getProxyEntrypoint(entrypointName),
					},
					env: {
						// Provide the DeviceSender binding for sending commands to the device
						DEVICE: (this.ctx as any).exports.DeviceSender({
							props: { deviceId, projectId },
						}),
						// Provide the DevicesBridge binding for inter-device RPC
						__DEVICE_BRIDGE: (this.ctx as any).exports.DevicesBridge({
							props: { projectId, userId },
						}),
						// Metadata for console override prefix in proxy entrypoint
						__DEVICE_ID: deviceId,
						__PROJECT_ID: projectId,
						// Project-scoped environment variables
						__ENV_VARS: JSON.stringify(envVarsMap),
					},
					// Block network access for sandboxing
					globalOutbound: null,
				};
			});

			const entrypointClass = worker.getEntrypoint("ProxyEntrypoint") as {
				getTarget(): Promise<object>;
			};

			// console.log(`User worker initialized for device ${deviceId} with version ${versionId}`);

			// IMPORTANT: getTarget() returns a Promise because it's an RPC call
			const target = await entrypointClass.getTarget();

			return target as unknown as IUserDeviceWorker;
		} catch (error) {
			console.error("Failed to get/create user worker:", {
				error: {
					name: (error as Error).name,
					message: (error as Error).message,
				},
			});
			throw new Error("Failed to initialize user worker");
		}
	}

	/**
	 * Handles an incoming inter-device RPC call.
	 * Called by DevicesBridge when another device invokes a method on this device.
	 */
	async handleRemoteCall(request: {
		methodName: string;
		args: unknown[];
		callDepth: number;
		scriptMeta: {
			userId: string;
			projectId: string;
			deviceId: string;
			versionId: string;
			entrypointName: string;
		};
	}): Promise<unknown> {
		// Ensure deviceMeta is available (may not exist if device never connected via WS)
		if (!this.deviceMeta) {
			const stored =
				await this.ctx.storage.get<typeof this.deviceMeta>("deviceMeta");
			if (stored) {
				this.deviceMeta = stored;
			} else {
				throw new Error(
					"Device has not connected yet — cannot handle remote call without device metadata",
				);
			}
		}

		const userWorker = await this.getOrCreateUserWorker();
		if (!userWorker.callMethod) {
			throw new Error("User worker does not support remote method calls");
		}
		return userWorker.callMethod(
			request.methodName,
			request.args,
			request.callDepth,
		);
	}

	/**
	 * Sends a command to the device without waiting for an acknowledgement.
	 * @param command The command object to send.
	 */
	sendCommandWithoutAck(command: DeviceCommand): void {
		const session = this.getSession();
		if (
			!session ||
			session.websocket.readyState !== WebSocket.READY_STATE_OPEN
		) {
			throw new Error("Device not connected");
		}
		// Send the command to the device
		console.log("sending command without ack:", JSON.stringify(command));
		session.websocket.send(JSON.stringify(command));
	}

	/**
	 * Sends a command to the device and returns a Promise that resolves with the device's
	 * acknowledgement or rejects after a timeout.
	 * @param command The command object to send.
	 */
	sendCommandAndWaitForResponse<C extends DeviceCommand>(
		command: C,
	): Promise<CommandResponseTypeMap[C["type"]]> {
		return new Promise((resolve, reject) => {
			const session = this.getSession();
			if (!session) {
				return reject(new Error("No active session"));
			}

			if (this.pendingCommands.size >= BaseDevice.MAX_PENDING_COMMANDS) {
				return reject(new Error("Too many pending commands"));
			}

			const timeoutId = setTimeout(() => {
				this.pendingCommands.delete(command.id);
				reject(
					new Error(
						`Timeout: No response from device for command '${command.type}' with id '${command.id}' within 5 seconds.`,
					),
				);
			}, 5000); // 5-second timeout

			this.pendingCommands.set(command.id, { resolve, reject, timeoutId });

			// Send the command to the device
			console.log("sending:", JSON.stringify(command));
			if (session.websocket.readyState === WebSocket.READY_STATE_OPEN) {
				session.websocket.send(JSON.stringify(command));
			} else {
				reject(new Error("WebSocket is not open"));
			}
		});
	}

	async webSocketMessage(_ws: WebSocket, data: ArrayBuffer | string) {
		// Ensure _session is set from the current WebSocket
		// This is needed because RPC calls from user workers may not have access to ctx.getWebSockets()
		this._session = { websocket: _ws };

		if (typeof data !== "string") {
			console.error("Received non-string WebSocket data, ignoring");
			return;
		}

		try {
			const raw = JSON.parse(data);
			const parsed = DeviceMessageSchema.safeParse(raw);
			if (!parsed.success) {
				console.error("Invalid device message:", parsed.error.message);
				return;
			}
			const message = parsed.data as DeviceResponse;

			// Handle device connect message
			if (message.type === "device_connected") {
				// console.log("Device connect message received, calling onDeviceConnect");
				const userWorker = await this.getOrCreateUserWorker();
				try {
					await userWorker.onDeviceConnect();
				} catch (error) {
					console.error("Error in user worker onDeviceConnect:", error);
				}
				// Initialize cron schedules from the user script after connect
				try {
					await this.initializeCrons(userWorker);
				} catch (error) {
					console.error("Error initializing cron schedules:", error);
				}
				return;
			}

			const pendingCommand = this.pendingCommands.get(message.id);

			if (pendingCommand) {
				console.log(`Resolving pending command ${message.id}`);
				clearTimeout(pendingCommand.timeoutId);
				this.pendingCommands.delete(message.id);

				if (message.type === "command_error") {
					pendingCommand.reject(
						new Error(`Device error: ${message.payload.error}`),
					);
				} else {
					pendingCommand.resolve(message);
				}
			} else {
				// Forward unsolicited messages to the user worker
				// console.log(
				// 	`Forwarding unsolicited message to user worker: ${message.type}`,
				// );

				const userWorker = await this.getOrCreateUserWorker();

				try {
					await userWorker.onMessage(message);
				} catch (error) {
					console.error("Error in user worker onMessage:", error);
				}
			}
		} catch (_error) {
			console.error("Failed to parse message from device:", {
				data: data,
				error: {
					name: (_error as Error).name,
					message: (_error as Error).message,
					stack: (_error as Error).stack,
				},
			});
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		_wasClean: boolean,
	) {
		console.log(`webSocketClose with code ${code}, ${reason}`);
		await this.handleConnectionLost(
			`WebSocket closed. Code: ${code}, Reason: ${reason}`,
		);
		ws.close(code, "Durable Object is closing WebSocket");
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		console.log(`webSocketError: ${error}`);
		await this.handleConnectionLost(`WebSocket error: ${error}`);
		ws.close(1011, "WebSocket error");
	}

	private async handleConnectionLost(reason: string) {
		// Reject all pending commands because we can no longer receive responses.
		for (const [_id, command] of this.pendingCommands.entries()) {
			clearTimeout(command.timeoutId);
			command.reject(new Error(reason));
		}
		this.pendingCommands.clear();
		this._session = undefined;
		this._connectedSince = undefined;

		await this.ctx.storage.delete(CONNECTED_SINCE_KEY);

		// Clean up the user worker (restore it first if needed)
		const worker = await this.getOrCreateUserWorker();
		if (worker) {
			try {
				await worker.onDeviceDisconnect();
				console.log(`User worker onDeviceDisconnect completed`);
			} catch (error) {
				console.error("Error in user worker onDeviceDisconnect:", error);
			}
		}
	}

	/**
	 * Reads the user worker's cron definitions, updates DO storage, and schedules
	 * the next DO alarm for the earliest pending cron. Called after onDeviceConnect.
	 */
	protected async initializeCrons(
		userWorker: IUserDeviceWorker,
	): Promise<void> {
		const crons = userWorker.getCrons ? await userWorker.getCrons() : {};

		if (!crons || Object.keys(crons).length === 0) {
			// No crons defined — clear any previously stored schedule and cancel any pending alarm
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
			await this.ctx.storage.deleteAlarm();
			return;
		}

		const now = Date.now();
		// Read existing schedule so we can preserve nextFireAt for unchanged entries.
		// This prevents a reconnect from pushing a cron's next fire time out by a full
		// period (e.g. a watchdog that fires every minute won't be delayed by a reconnect
		// that happens 58 seconds in).
		const existing =
			(await this.ctx.storage.get<CronStorage>(CRON_STORAGE_KEY)) ?? {};
		const storage: CronStorage = {};

		for (const [name, expr] of Object.entries(crons)) {
			try {
				const prev = existing[name];
				// Preserve the scheduled fire time if the cron expression hasn't changed
				const nextFireAt =
					prev && prev.cron === expr
						? prev.nextFireAt
						: nextCronTime(expr, now);
				storage[name] = { cron: expr, nextFireAt };
			} catch (err) {
				console.error(`Invalid cron expression for "${name}": ${err}`);
			}
		}

		if (Object.keys(storage).length === 0) {
			// All cron expressions were invalid — clear any stale schedule so old crons
			// don't keep firing with now-invalid expressions.
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
			await this.ctx.storage.deleteAlarm();
			return;
		}

		await this.ctx.storage.put(CRON_STORAGE_KEY, storage);

		await this.ctx.storage.setAlarm(earliestFireTime(storage));
	}

	/**
	 * Handle alarms — dispatches named cron handlers defined in the user script.
	 * After firing due crons, recalculates next fire times and reschedules the alarm.
	 *
	 * The pure dispatch logic (schedule sync + due-cron resolution) lives in
	 * `resolveDueCrons()` in cronDispatch.ts so it can be unit-tested without a
	 * Durable Object context or LOADER binding.
	 */
	async alarm(): Promise<void> {
		const schedules = await this.ctx.storage.get<CronStorage>(CRON_STORAGE_KEY);

		if (!schedules || Object.keys(schedules).length === 0) {
			// No cron schedules — fall back to legacy onAlarm if defined
			let legacyWorker: IUserDeviceWorker | null = null;
			try {
				legacyWorker = await this.getOrCreateUserWorker();
			} catch (err) {
				console.error("Worker unavailable during alarm (legacy path):", err);
				return;
			}
			if (legacyWorker?.onAlarm) {
				try {
					await legacyWorker.onAlarm();
				} catch (error) {
					console.error("Error in user worker onAlarm:", error);
				}
			}
			return;
		}

		const now = Date.now();

		// Guard: if the worker is unavailable, reschedule without advancing so cron
		// firings are not silently lost. The alarm will retry when the next
		// nextFireAt arrives (or after 60 s minimum).
		let userWorker: IUserDeviceWorker | null;
		try {
			userWorker = await this.getOrCreateUserWorker();
		} catch (err) {
			console.error(
				"Worker unavailable during alarm — rescheduling without advancing cron schedule:",
				err,
			);
			await this.ctx.storage.setAlarm(
				Math.max(Date.now() + 60_000, earliestFireTime(schedules)),
			);
			return;
		}

		// Guard: getOrCreateUserWorker could theoretically return null (e.g. if the
		// implementation changes). Treat null like an exception — reschedule without
		// advancing so cron firings are not silently lost.
		if (userWorker === null) {
			console.error(
				"Worker returned null during alarm — rescheduling without advancing cron schedule",
			);
			await this.ctx.storage.setAlarm(
				Math.max(Date.now() + 60_000, earliestFireTime(schedules)),
			);
			return;
		}

		// Resolve which crons are due and get the updated schedule.
		// Uses the user script's current cron definitions if available so that
		// added/removed/changed crons are reflected without requiring a reconnect.
		// Wrapped in try/catch: if the RPC throws (e.g. worker evicted mid-alarm),
		// fall back to stored cron expressions so no firings are silently lost.
		let currentCrons: Record<string, string>;
		try {
			currentCrons = userWorker.getCrons
				? await userWorker.getCrons()
				: Object.fromEntries(
						Object.entries(schedules).map(([name, e]) => [name, e.cron]),
					);
		} catch (err) {
			console.error(
				"getCrons() RPC failed during alarm — falling back to stored cron expressions:",
				err,
			);
			currentCrons = Object.fromEntries(
				Object.entries(schedules).map(([name, e]) => [name, e.cron]),
			);
		}

		let due: string[];
		let updated: CronStorage;
		try {
			({ due, updated } = resolveDueCrons(
				schedules,
				currentCrons,
				now,
				nextCronTime,
			));
		} catch (err) {
			// Invalid cron expression in user script — reschedule without advancing
			// so no firings are permanently lost. The script can be fixed and redeployed.
			console.error(
				"Error resolving due crons — rescheduling without advancing:",
				err,
			);
			await this.ctx.storage.setAlarm(
				Math.max(Date.now() + 60_000, earliestFireTime(schedules)),
			);
			return;
		}

		// Dispatch onCron for each due schedule
		for (const name of due) {
			if (userWorker.onCron) {
				try {
					await userWorker.onCron(name);
				} catch (error) {
					console.error(
						`Error in user worker onCron(${JSON.stringify(name.slice(0, 64))}):`,
						error,
					);
				}
			}
		}

		// Persist updated schedule and reschedule the next alarm
		if (Object.keys(updated).length > 0) {
			await this.ctx.storage.put(CRON_STORAGE_KEY, updated);
			await this.ctx.storage.setAlarm(earliestFireTime(updated));
		} else {
			// All crons were removed — clear stored schedule and cancel the
			// now-orphaned alarm so it doesn't fire a ghost wake-up.
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
			await this.ctx.storage.deleteAlarm();
		}
	}

	/**
	 * KV storage methods for user scripts.
	 * Keys starting with `__internal:` are reserved for internal use and are blocked.
	 */
	async kvGet<T = unknown>(key: string): Promise<T | undefined> {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		return this.ctx.storage.get<T>(key);
	}

	async kvPut<T>(key: string, value: T): Promise<void> {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		await this.ctx.storage.put(key, value);
	}

	async kvDelete(key: string): Promise<boolean> {
		// Returns false (no-op) rather than throwing — deletes are idempotent,
		// so silently ignoring an attempt to delete a reserved key is safe.
		// kvGet and kvPut throw for reserved keys to prevent accidental reads/writes.
		if (key.startsWith(INTERNAL_KEY_PREFIX)) return false;
		return this.ctx.storage.delete(key);
	}

	/**
	 * Ensures the device_logs SQLite table exists in this DO's storage.
	 */
	private ensureLogsTable(): void {
		if (this.logsTableReady) return;
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS device_logs (
				id TEXT PRIMARY KEY,
				level TEXT NOT NULL,
				message TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`);
		this.ctx.storage.sql.exec(
			"CREATE INDEX IF NOT EXISTS idx_logs_created_at ON device_logs(created_at)",
		);
		this.logsTableReady = true;
	}

	/**
	 * Persists a log entry from user code into DO SQLite storage.
	 * Called via DeviceSender RPC from the proxy entrypoint's console override.
	 */
	async persistLog(level: string, message: string): Promise<void> {
		if (!VALID_LOG_LEVELS.includes(level as LogLevel)) return;
		this.ensureLogsTable();
		const truncated =
			message.length > LOG_MESSAGE_MAX_LENGTH
				? message.slice(0, LOG_MESSAGE_MAX_LENGTH)
				: message;
		this.ctx.storage.sql.exec(
			"INSERT INTO device_logs (id, level, message, created_at) VALUES (?, ?, ?, ?)",
			crypto.randomUUID(),
			level,
			truncated,
			Date.now(),
		);
		this.logWriteCount++;
		if (this.logWriteCount % LOG_CLEANUP_INTERVAL === 0) {
			this.ctx.storage.sql.exec(
				"DELETE FROM device_logs WHERE created_at < ?",
				Date.now() - LOG_RETENTION_MS,
			);
			this.ctx.storage.sql.exec(
				`DELETE FROM device_logs WHERE id NOT IN (
					SELECT id FROM device_logs ORDER BY created_at DESC LIMIT ?
				)`,
				LOG_MAX_STORED,
			);
		}
	}

	/**
	 * Retrieves logs from DO SQLite storage with cursor-based pagination.
	 */
	async getLogs(options: {
		cursor?: string;
		limit?: number;
		level?: string;
	}): Promise<{
		logs: Array<{
			id: string;
			level: string;
			message: string;
			created_at: number;
		}>;
		next_cursor: string | null;
	}> {
		this.ensureLogsTable();
		const limit = Math.min(options.limit ?? 50, 100);

		let cursorTs = Date.now() + 1;
		let cursorId = "\uffff"; // Sorts after any UUID
		if (options.cursor) {
			const sepIdx = options.cursor.indexOf(":");
			if (sepIdx !== -1) {
				cursorTs = Number(options.cursor.slice(0, sepIdx));
				cursorId = options.cursor.slice(sepIdx + 1);
			}
		}

		const rows = options.level
			? this.ctx.storage.sql
					.exec(
						`SELECT id, level, message, created_at FROM device_logs
					 WHERE (created_at < ? OR (created_at = ? AND id < ?)) AND level = ?
					 ORDER BY created_at DESC, id DESC LIMIT ?`,
						cursorTs,
						cursorTs,
						cursorId,
						options.level,
						limit + 1,
					)
					.toArray()
			: this.ctx.storage.sql
					.exec(
						`SELECT id, level, message, created_at FROM device_logs
					 WHERE (created_at < ? OR (created_at = ? AND id < ?))
					 ORDER BY created_at DESC, id DESC LIMIT ?`,
						cursorTs,
						cursorTs,
						cursorId,
						limit + 1,
					)
					.toArray();

		const hasMore = rows.length > limit;
		const logs = rows.slice(0, limit) as Array<{
			id: string;
			level: string;
			message: string;
			created_at: number;
		}>;
		const lastLog = logs[logs.length - 1];
		const nextCursor = hasMore ? `${lastLog.created_at}:${lastLog.id}` : null;

		return { logs, next_cursor: nextCursor };
	}

	/**
	 * Returns the live WebSocket connection status of the device.
	 * Uses getWebSockets() which is always authoritative for Hibernation API connections.
	 */
	async getConnectionStatus(): Promise<{
		connected: boolean;
		connectedSince: number | null;
	}> {
		const sockets = this.ctx.getWebSockets();
		const connected = sockets.length > 0;
		// _connectedSince is in-memory only — set on connect, cleared on disconnect.
		// After hibernation it will be undefined even if a socket exists, which is acceptable
		// since connected_since is cosmetic (the connected boolean is always authoritative).
		const connectedSince = connected ? (this._connectedSince ?? null) : null;
		return { connected, connectedSince };
	}

	/**
	 * Sends a hardware command to the device and returns the result.
	 * Called from the sendCommand API endpoint.
	 */
	async handleCommand(
		command: Omit<DeviceCommand, "id">,
	): Promise<{ status: number; body: string }> {
		const sockets = this.ctx.getWebSockets();
		if (sockets.length === 0) {
			return { status: 503, body: "Device not connected" };
		}
		const ws = sockets[0];
		if (ws.readyState !== WebSocket.READY_STATE_OPEN) {
			return { status: 503, body: "Device not connected" };
		}
		// Ensure _session is in sync with live socket after potential DO hibernation
		if (!this._session) {
			this._session = { websocket: ws };
		}

		const fullCommand: DeviceCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;

		try {
			const response = await this.sendCommandAndWaitForResponse(fullCommand);
			return { status: 200, body: JSON.stringify(response) };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "An unknown error occurred";
			const isTimeout = errorMessage.toLowerCase().includes("timeout");
			return { status: isTimeout ? 504 : 500, body: errorMessage };
		}
	}

	/**
	 * Triggers a device reboot for script deployment.
	 * Called from upload/deploy endpoints to restart the device so it loads the new script version.
	 */
	async triggerRebootForDeploy(): Promise<{
		rebooted: boolean;
		reason: string;
	}> {
		const session = this.getSession();
		console.log(
			`[reboot] Session found: ${!!session}, readyState: ${session?.websocket.readyState}`,
		);

		if (
			!session ||
			session.websocket.readyState !== WebSocket.READY_STATE_OPEN
		) {
			return {
				rebooted: false,
				reason: "Device not connected",
			};
		}

		try {
			// Send reboot command (fire-and-forget)
			const rebootCommand: DeviceCommand = {
				id: crypto.randomUUID(),
				type: "reboot",
				payload: {},
			};
			session.websocket.send(JSON.stringify(rebootCommand));
			// Don't close the WebSocket — the device will reboot and the
			// connection drops naturally. Sending a close frame in the same
			// TCP segment as the reboot command causes a hard fault on the
			// Pico (tcp_close inside lwIP recv callback).

			return {
				rebooted: true,
				reason: "Reboot command sent",
			};
		} catch (error) {
			return {
				rebooted: false,
				reason: `Failed to send reboot: ${(error as Error).message}`,
			};
		}
	}
}

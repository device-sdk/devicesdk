import { DurableObject } from "cloudflare:workers";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
} from "@devicesdk/core";
import { z } from "zod";
import {
	recordCommandRpc,
	recordDeviceUsage,
	recordScriptInit,
} from "../../foundation/analytics";
import {
	type LogLevel,
	MESSAGE_COUNT_DATE_KEY,
	MESSAGE_COUNT_KEY,
	TIER_LIMITS,
	type UserPlan,
	VALID_LOG_LEVELS,
	WS_CLOSE_RATE_LIMITED,
	WS_CLOSE_REPLACED,
} from "../../foundation/consts";
import { logger } from "../../foundation/logger";
import type { Env } from "../../types";
import { getProxyEntrypoint } from "./classProxy";
import { type CronStorage, resolveDueCrons } from "./cronDispatch";
import { nextCronTime } from "./cronParser";
import {
	broadcastStateFromMessage,
	broadcastToWatchers,
	emitStatusEvent,
	fetchRecentLogs,
	type LogStreamState,
	persistAndBroadcastLog,
} from "./logStreaming";
import {
	drainPendingUserWorkerEvents,
	enqueueUserWorkerEvent,
	PENDING_USER_EVENTS_KEY,
	type PendingUserEvent,
} from "./userEventQueue";
import type {
	DeviceSenderInterface,
	DeviceSenderProps,
	IUserDeviceWorker,
} from "./userWorkerTypes";

// ctx.exports loopback bindings for top-level WorkerEntrypoints. Properly typed
// via Cloudflare.Exports when GlobalProps.mainModule is configured; until then
// we narrow locally so consumers don't have to use `as any`.
type DeviceCtxExports = {
	DeviceSender: (opts: { props: DeviceSenderProps }) => DeviceSenderInterface;
	DevicesBridge: (opts: {
		props: { projectId: string; userId: string };
	}) => DeviceSenderInterface;
};

const DeviceMessageSchema = z.object({
	id: z.string().max(64).optional().default(""),
	type: z.string().max(64),
	payload: z.record(z.string(), z.unknown()).optional().default({}),
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
	resolve: (value: DeviceResponse) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	startedAt: number;
	commandType: string;
}

export class BaseDevice extends DurableObject<Env> {
	private static readonly MAX_PENDING_COMMANDS = 100;
	private _session?: DeviceSession;
	private pendingCommands: Map<string, PendingCommand> = new Map();
	// Mutable holder for log-streaming bookkeeping. See logStreaming.ts.
	private logStream: LogStreamState = {
		logsTableReady: false,
		logWriteCount: 0,
		lastLogCleanupAt: 0,
	};
	// In-memory only — cosmetic field, not durable. Avoids a storage write on the hot path.
	private _connectedSince?: number;

	// Message counting for daily rate limits
	private _messageCountToday = 0;
	private _messageCountDate = ""; // "YYYY-MM-DD" UTC
	private _messageLimitNotified = false; // Avoid sending duplicate rate_limit messages

	// In-memory tristate: null = unknown (post-hibernation), true/false = cached
	// answer for "are there any cron schedules?". Lets alarm() skip the
	// CRON_STORAGE_KEY read once we've confirmed there are none.
	private _hasCrons: boolean | null = null;

	// Cached user worker stub, keyed by workerId (project:device:version).
	// A new script deploy bumps versionId → workerId → cache miss → rebuild.
	// DO eviction discards this naturally; the next call rebuilds.
	// Protected (not private) so TestDevice can seed/inspect it to assert the
	// invocation-scoped cache-clear in alarm()/handleRemoteCall().
	protected cachedUserWorker: {
		workerId: string;
		worker: IUserDeviceWorker;
	} | null = null;

	// [DIAG2] Wall-clock when cachedUserWorker was last (re)resolved. Logged on the
	// warm path so we can correlate stub age with the "Too many subrequests" wedge.
	private _diagWorkerCachedAt?: number;

	// Device metadata from connection
	private deviceMeta?: {
		userId: string;
		projectId: string;
		versionId: string;
		deviceId: string;
		// Slugs are what uploadScript/getScript/deployVersion use as the R2
		// key prefix, so getOrCreateUserWorker has to use slugs too — the
		// `projectId`/`deviceId` fields above are UUIDs and do NOT match any
		// R2 object key. Optional on the type so older stored deviceMeta
		// (pre-upgrade) still parses; filled in on every reconnect.
		projectSlug?: string;
		deviceSlug?: string;
		entrypointName: string;
		plan: UserPlan;
	};

	/**
	 * Gets the current WebSocket session, restoring it from hibernation if necessary.
	 */
	protected getSession(): DeviceSession | undefined {
		if (this._session) {
			return this._session;
		}

		// Filter by "device" tag so watcher WebSockets don't get picked up as the firmware session.
		// Prefer an OPEN socket: a device that lost power can leave a half-open socket attached
		// until the runtime reaps it, and picking that ghost over the live reconnect would send
		// every command into a dead connection (device stuck on the "Server" screen). The connect
		// handler proactively closes stale sockets, but a closing one can still linger here briefly.
		const sockets = this.ctx.getWebSockets("device");
		const live =
			sockets.find((s) => s.readyState === WebSocket.READY_STATE_OPEN) ??
			sockets[0];
		if (live) {
			this._session = { websocket: live };
			return this._session;
		}

		return undefined;
	}

	async fetch(request: Request) {
		const url = new URL(request.url);

		if (url.pathname.endsWith("/watch-websocket")) {
			return this.handleWatcherUpgrade(request);
		}
		if (url.pathname.endsWith("/websocket")) {
			return this.handleWebSocketUpgrade(request);
		}
		// POST handler removed — commands use WebSocket RPC only
		return new Response("Not found", { status: 404 });
	}

	/**
	 * Handles a watcher WebSocket upgrade (e.g. dashboard, Home Assistant, CLI
	 * `devicesdk logs --tail`).
	 *
	 * Query parameters:
	 *   `backfillLimit` (1..100) — if set, replay the last N device_logs rows
	 *      as `{ event: "log", data: {...}, replay: true }` frames before live
	 *      events start arriving, then send `{ event: "history_complete" }`.
	 *   `backfillLevel` (one of VALID_LOG_LEVELS) — optional filter for the
	 *      replay frames only; live events are unfiltered.
	 *
	 * No backfill is sent unless `backfillLimit` is explicitly provided so
	 * existing watchers (current dashboard, prior to migration) continue to
	 * work unchanged.
	 *
	 * The accepted socket is tagged "watcher" so it hibernates like the
	 * firmware connection and is never mistaken for the device session.
	 */
	async handleWatcherUpgrade(request: Request) {
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader !== "websocket") {
			return new Response("Expected Upgrade: websocket", { status: 426 });
		}

		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, ["watcher"]);

		// Send initial connection status so new watchers don't have to wait
		// for the next connect/disconnect event to know the device state.
		try {
			const status = await this.getConnectionStatus();
			server.send(JSON.stringify({ event: "status", data: status }));
		} catch (error) {
			logger.error(error, "Failed to send initial status to watcher");
		}

		// Optional log history backfill. Single SQL scan per connect — never
		// per poll — so cost is bounded by reconnect rate, not by client
		// activity.
		const url = new URL(request.url);
		const rawLimit = url.searchParams.get("backfillLimit");
		if (rawLimit !== null) {
			const parsed = Number.parseInt(rawLimit, 10);
			const limit = Number.isFinite(parsed)
				? Math.min(Math.max(parsed, 1), 100)
				: 0;
			if (limit > 0) {
				const rawLevel = url.searchParams.get("backfillLevel");
				const level =
					rawLevel && VALID_LOG_LEVELS.includes(rawLevel as LogLevel)
						? rawLevel
						: undefined;
				try {
					const { logs } = fetchRecentLogs(this.ctx, this.logStream, {
						limit,
						level,
					});
					// Send oldest first so the client can append in display order.
					for (let i = logs.length - 1; i >= 0; i--) {
						server.send(
							JSON.stringify({ event: "log", data: logs[i], replay: true }),
						);
					}
				} catch (error) {
					logger.error(error, "Watcher backfill failed");
				}
				server.send(JSON.stringify({ event: "history_complete" }));
			}
		}

		return new Response(null, { status: 101, webSocket: client });
	}

	/**
	 * Handles the initial WebSocket connection from the device.
	 */
	async handleWebSocketUpgrade(request: Request) {
		const upgradeHeader = request.headers.get("Upgrade");
		if (!upgradeHeader || upgradeHeader !== "websocket") {
			return new Response("Expected Upgrade: websocket", { status: 426 });
		}

		// Enforce a single live device session. A device that lost power (or whose
		// TCP connection went half-open) can leave a stale "device" socket attached
		// to this DO until the Hibernation runtime reaps it — which can lag the
		// device's own reboot+reconnect. If the new socket lands while the ghost is
		// still present, getWebSockets("device") holds two entries and command
		// dispatch could target the dead one, leaving the freshly-rebooted device
		// stuck on the "Server" screen (its frames never arrive). Close any existing
		// device sockets before accepting the replacement.
		//
		// Server-initiated close() does NOT invoke our webSocketClose() handler (if
		// it did, the close() call inside that handler would recurse), so this does
		// not trigger handleConnectionLost() — no spurious connected=0 write or
		// onDeviceDisconnect event races the new session being set up below.
		for (const stale of this.ctx.getWebSockets("device")) {
			try {
				stale.close(WS_CLOSE_REPLACED, "Replaced by a new device connection");
			} catch {
				/* socket already closing/closed — nothing to do */
			}
		}

		// Extract project/version/device info from URL
		const url = new URL(request.url);
		const userId = url.searchParams.get("userId");
		const projectId = url.searchParams.get("projectId");
		const versionId = url.searchParams.get("versionId");
		const deviceId = url.searchParams.get("deviceId");
		const projectSlug = url.searchParams.get("projectSlug") ?? undefined;
		const deviceSlug = url.searchParams.get("deviceSlug") ?? undefined;
		const entrypointName = url.searchParams.get("entrypointName");
		const plan = (url.searchParams.get("plan") ?? "free") as UserPlan;

		if (!userId || !projectId || !deviceId || !versionId || !entrypointName) {
			return new Response("Missing userId or projectId", { status: 400 });
		}

		// Check if this free-tier device has already exhausted its daily message limit
		if (plan === "free") {
			await this.restoreMessageCount();
			const today = new Date().toISOString().slice(0, 10);
			if (
				this._messageCountDate === today &&
				this._messageCountToday >= TIER_LIMITS.free.maxMessagesPerDevicePerDay
			) {
				const retryAfter = this.secondsUntilMidnightUtc();

				// Accept WS briefly to send rate_limit message (firmware can't parse HTTP error bodies)
				const [client, server] = Object.values(new WebSocketPair());
				this.ctx.acceptWebSocket(server, ["device"]);

				server.send(
					JSON.stringify({
						type: "rate_limit",
						payload: {
							error: "Daily message limit reached",
							retry_after: retryAfter,
						},
					}),
				);
				server.close(WS_CLOSE_RATE_LIMITED, "Daily message limit reached");

				// Log the refused connection
				await this.persistLog(
					"warn",
					`Connection refused: daily message limit reached (${this._messageCountToday}/${TIER_LIMITS.free.maxMessagesPerDevicePerDay}). Retry after ${retryAfter}s.`,
				);

				return new Response(null, { status: 101, webSocket: client });
			}
		}

		this.deviceMeta = {
			userId,
			projectId,
			versionId,
			deviceId,
			projectSlug,
			deviceSlug,
			entrypointName,
			plan,
		};

		// Store deviceMeta in DO storage so it persists through hibernation
		await this.ctx.storage.put("deviceMeta", this.deviceMeta);

		const [client, server] = Object.values(new WebSocketPair());

		this.ctx.acceptWebSocket(server, ["device"]);
		this._session = { websocket: server };
		this._connectedSince = Date.now();
		this._messageLimitNotified = false;

		await this.ctx.storage.put(CONNECTED_SINCE_KEY, this._connectedSince);

		// Notify watcher WebSockets of new connection
		emitStatusEvent(this.ctx, {
			connected: true,
			connectedSince: this._connectedSince,
		});

		// Cache connection status in D1 so getProject can read it without DO round-trips
		await this.env.DB.prepare(
			"UPDATE devices SET connected = 1, last_connected_at = ? WHERE id = ?",
		)
			.bind(Date.now(), this.deviceMeta.deviceId)
			.run();

		// Re-arm any per-device cron alarm from the persisted schedule now that a
		// device socket is live again. alarm()'s cost guard cancels the alarm while
		// no device is connected; the only other re-arm path is initializeCrons(),
		// which runs only after a fresh `device_connected` message is drained. A
		// transport-level reconnect (or a half-open socket the runtime later
		// replaces) can re-establish the connection without that handshake being
		// processed, which would otherwise leave the cron cancelled forever. This
		// closes that gap. No-op on a first connect (no schedule stored yet).
		await this.rearmCronAlarmFromStorage();

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
	protected async getOrCreateUserWorker(): Promise<IUserDeviceWorker> {
		const deviceMeta = await this.getDeviceMeta();
		if (!deviceMeta) {
			throw new Error(
				"Failed to create user worker, because deviceMeta is empty",
			);
		}

		const {
			userId,
			projectId,
			versionId,
			deviceId,
			projectSlug,
			deviceSlug,
			entrypointName,
		} = deviceMeta;
		// Stable workerId so repeated LOADER.get() calls return the same
		// dynamic worker instead of spawning a new one on every alarm tick
		// (which blows "Too many concurrent dynamic workers" very quickly).
		// Changing versionId naturally invalidates the cache, because a new
		// script deploy sets a fresh versionId → new workerId.
		const workerId = `${projectId}:${deviceId}:${versionId}`;

		// Reuse the resolved stub only *within* the current DO invocation. The
		// cache is cleared at every invocation entry point (alarm(),
		// handleRemoteCall()) because the getTarget() handle is a child-isolate
		// RPC stub scoped to the invocation that created it — reusing it across
		// invocations is stale and fans out subrequests until the cap trips (the
		// "Too many subrequests" / 60s-wall wedge). Within one tick this still
		// avoids a second LOADER.get() + getTarget() when several code paths
		// (drain, then cron) need the worker, which keeps us clear of the
		// "Too many concurrent dynamic workers" limit a stable workerId guards.
		if (this.cachedUserWorker?.workerId === workerId) {
			// [DIAG2] Did this tick take the warm (cached cross-invocation stub)
			// path? If the "Too many subrequests" wedge correlates with cache=warm,
			// the cached getTarget() handle is stale across DO invocations (its
			// child isolate was recycled) and re-calling it fans out subrequests.
			logger.warn("[DIAG2] getOrCreateUserWorker cache=warm", {
				deviceId,
				ageMs: Date.now() - (this._diagWorkerCachedAt ?? 0),
			});
			return this.cachedUserWorker.worker;
		}

		// uploadScript / getScript / deployVersion all address R2 with
		// /{userId}/{projectSlug}/{deviceSlug}/{versionId}.js. The DO receives
		// UUIDs for projectId/deviceId from deviceConnect, which do not match
		// any R2 key. Prefer the slugs stored on deviceMeta; fall back to the
		// UUIDs only for older stored deviceMeta records written before the
		// slug fields were added (which will fail to find a script — but that
		// matches the prior silently-broken behavior, so nothing regresses).
		const r2ProjectKey = projectSlug ?? projectId;
		const r2DeviceKey = deviceSlug ?? deviceId;

		const initStartedAt = Date.now();
		try {
			// Resolve a fresh worker for this invocation. The stub is stored in
			// this.cachedUserWorker only for intra-invocation reuse (see above) —
			// it is NOT valid across invocations, so the entry points clear it.
			const worker = this.env.LOADER.get(workerId, async () => {
				const scriptKey = `${userId}/${r2ProjectKey}/${r2DeviceKey}/${versionId}.js`;
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

				const ctxExports = (
					this.ctx as DurableObjectState & { exports: DeviceCtxExports }
				).exports;

				return {
					compatibilityDate: "2026-04-24",
					mainModule: "main.js",
					modules: {
						"device.js": userCode,
						"main.js": getProxyEntrypoint(entrypointName),
					},
					env: {
						// Provide the DeviceSender binding for sending commands to the device
						DEVICE: ctxExports.DeviceSender({
							props: { deviceId, projectId },
						}),
						// Provide the DevicesBridge binding for inter-device RPC
						__DEVICE_BRIDGE: ctxExports.DevicesBridge({
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

			// [DIAG2] Mark the cold path so a wedged tick on cache=cold (vs warm)
			// would instead implicate worker spawn / R2 / D1 / getTarget.
			logger.warn("[DIAG2] getOrCreateUserWorker cache=cold pre-getTarget", {
				deviceId,
			});

			// IMPORTANT: getTarget() returns a Promise because it's an RPC call
			const target = await entrypointClass.getTarget();

			logger.warn("[DIAG2] getOrCreateUserWorker post-getTarget", {
				deviceId,
				getTargetMs: Date.now() - initStartedAt,
			});

			const resolved = target as unknown as IUserDeviceWorker;
			this.cachedUserWorker = { workerId, worker: resolved };
			this._diagWorkerCachedAt = Date.now();
			recordScriptInit(this.env.ANALYTICS, {
				source: "runtime",
				initLatencyMs: Date.now() - initStartedAt,
				deviceId,
				projectId,
				versionId,
			});
			return resolved;
		} catch (error) {
			// Preserve the inner message so callers can classify the failure
			// (e.g. drainPendingUserWorkerEvents distinguishes transient vs
			// persistent errors via TRANSIENT_ERROR_PATTERNS).
			// Don't log here — the caller decides whether to log or rethrow,
			// since transient retries shouldn't spam Sentry.
			throw new Error(
				`Failed to initialize user worker: ${(error as Error).message}`,
			);
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
		// Drop any user-worker stub cached by a previous invocation — a cached
		// getTarget() handle is an invocation-scoped child-isolate RPC stub and
		// goes stale across calls (see the note in alarm() and the
		// cloudflare-runtime-limitations skill). Re-resolve fresh for this call.
		this.cachedUserWorker = null;

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
	 * Usage metric: one outbound (cloud → device) command. Shared by both the
	 * fire-and-forget and request/response send paths. No-op without deviceMeta.
	 */
	private recordMessageOut(bytes: number): void {
		if (!this.deviceMeta) return;
		recordDeviceUsage(this.env.USAGE, {
			deviceId: this.deviceMeta.deviceId,
			projectId: this.deviceMeta.projectId,
			userId: this.deviceMeta.userId,
			kind: "message_out",
			messagesOut: 1,
			bytesOut: bytes,
		});
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
		logger.debug("sending command without ack", { command });
		const serialized = JSON.stringify(command);
		session.websocket.send(serialized);
		recordCommandRpc(this.env.ANALYTICS, {
			commandType: command.type,
			outcome: "fire_and_forget",
			latencyMs: 0,
			ackReceived: false,
			deviceId: this.deviceMeta?.deviceId,
			projectId: this.deviceMeta?.projectId,
		});
		this.recordMessageOut(serialized.length);
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

			const startedAt = Date.now();
			const timeoutId = setTimeout(() => {
				this.pendingCommands.delete(command.id);
				recordCommandRpc(this.env.ANALYTICS, {
					commandType: command.type,
					outcome: "timeout",
					latencyMs: Date.now() - startedAt,
					ackReceived: false,
					deviceId: this.deviceMeta?.deviceId,
					projectId: this.deviceMeta?.projectId,
				});
				reject(
					new Error(
						`Timeout: No response from device for command '${command.type}' with id '${command.id}' within 5 seconds.`,
					),
				);
			}, 5000); // 5-second timeout

			this.pendingCommands.set(command.id, {
				resolve: resolve as (value: DeviceResponse) => void,
				reject,
				timeoutId,
				startedAt,
				commandType: command.type,
			});

			// Send the command to the device
			logger.debug("sending command", { command });
			if (session.websocket.readyState === WebSocket.READY_STATE_OPEN) {
				const serialized = JSON.stringify(command);
				session.websocket.send(serialized);
				this.recordMessageOut(serialized.length);
			} else {
				reject(new Error("WebSocket is not open"));
			}
		});
	}

	async webSocketMessage(_ws: WebSocket, data: ArrayBuffer | string) {
		// Watcher sockets are read-only; ignore any inbound messages.
		const tags = this.ctx.getTags(_ws);
		if (!tags.includes("device")) {
			return;
		}

		// Ensure _session is set from the current WebSocket
		// This is needed because RPC calls from user workers may not have access to ctx.getWebSockets()
		this._session = { websocket: _ws };

		if (typeof data !== "string") {
			logger.warn("Received non-string WebSocket data, ignoring");
			return;
		}

		// Parse before checkMessageLimit so we can early-exit on `ping` keepalive
		// frames without touching DO storage. A ping previously cost ~7 row reads
		// (restoreMessageCount + getDeviceMeta + enqueueUserWorkerEvent + the
		// alarm-fire that follows); short-circuiting drops that to 0.
		let parsed: ReturnType<typeof DeviceMessageSchema.safeParse>;
		try {
			const raw = JSON.parse(data);
			parsed = DeviceMessageSchema.safeParse(raw);
		} catch (_error) {
			logger.error(_error, "Failed to parse message from device", { data });
			return;
		}
		if (!parsed.success) {
			logger.warn("Invalid device message", { error: parsed.error.message });
			return;
		}
		// Keepalive — never count toward daily limit, never wake user worker.
		// Checked against the loose-typed schema (type: z.string()) before the
		// cast to DeviceResponse, which doesn't include "ping" as a variant.
		if (parsed.data.type === "ping") return;
		const message = parsed.data as DeviceResponse;

		// Check daily message limit
		const limitExceeded = await this.checkMessageLimit(_ws);
		if (limitExceeded) return;

		// Usage metric: one inbound (device → cloud) message that counted toward
		// the daily limit. ping keepalives and limit-dropped frames are excluded
		// above. checkMessageLimit() restored deviceMeta, so it's available here.
		if (this.deviceMeta) {
			recordDeviceUsage(this.env.USAGE, {
				deviceId: this.deviceMeta.deviceId,
				projectId: this.deviceMeta.projectId,
				userId: this.deviceMeta.userId,
				kind: "message_in",
				messagesIn: 1,
				bytesIn: data.length,
			});
		}

		try {
			// Handle device connect message
			if (message.type === "device_connected") {
				// Defer onDeviceConnect + cron initialization to the next alarm
				// firing so it runs in a fresh invocation context. Invoking
				// Worker Loader's getTarget() from inside a Hibernation-API
				// webSocketMessage handler hangs indefinitely in production.
				await this.enqueueUserWorkerEvent({ kind: "connect" });
				return;
			}

			// Fan out structured state events to watchers for known hardware messages.
			// Doing this alongside (not instead of) pending-command resolution and user
			// worker dispatch so existing flows are unaffected.
			broadcastStateFromMessage(this.ctx, message);

			const pendingCommand = this.pendingCommands.get(message.id);

			if (pendingCommand) {
				logger.debug("Resolving pending command", { id: message.id });
				clearTimeout(pendingCommand.timeoutId);
				this.pendingCommands.delete(message.id);

				recordCommandRpc(this.env.ANALYTICS, {
					commandType: pendingCommand.commandType,
					outcome: message.type === "command_error" ? "error" : "ack",
					latencyMs: Date.now() - pendingCommand.startedAt,
					ackReceived: true,
					deviceId: this.deviceMeta?.deviceId,
					projectId: this.deviceMeta?.projectId,
				});

				if (message.type === "command_error") {
					pendingCommand.reject(
						new Error(`Device error: ${message.payload.error}`),
					);
				} else {
					pendingCommand.resolve(message);
				}
			} else {
				// Forward unsolicited messages to the user worker via alarm
				// queue — see enqueueUserWorkerEvent for why we can't invoke
				// the Worker Loader directly from here.
				await this.enqueueUserWorkerEvent({ kind: "message", message });
			}
		} catch (_error) {
			logger.error(_error, "Failed to dispatch device message", { data });
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		_wasClean: boolean,
	) {
		// Watcher disconnects are handled entirely by the hibernation runtime;
		// nothing to tear down on our side.
		const tags = this.ctx.getTags(ws);
		if (!tags.includes("device")) {
			return;
		}

		logger.info("webSocketClose", { code, reason });
		await this.handleConnectionLost(
			`WebSocket closed. Code: ${code}, Reason: ${reason}`,
		);
		ws.close(code, "Durable Object is closing WebSocket");
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		const tags = this.ctx.getTags(ws);
		if (!tags.includes("device")) {
			// Best-effort close of the errored watcher socket; no state to clean.
			try {
				ws.close(1011, "WebSocket error");
			} catch {
				/* already closed */
			}
			return;
		}

		logger.info("webSocketError", { error: String(error) });
		await this.handleConnectionLost(`WebSocket error: ${error}`);
		ws.close(1011, "WebSocket error");
	}

	/**
	 * Returns seconds until midnight UTC.
	 */
	private secondsUntilMidnightUtc(): number {
		const now = new Date();
		const midnight = new Date(now);
		midnight.setUTCDate(midnight.getUTCDate() + 1);
		midnight.setUTCHours(0, 0, 0, 0);
		return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
	}

	/**
	 * Restores message count from DO storage (after hibernation or fresh start).
	 */
	private async restoreMessageCount(): Promise<void> {
		if (this._messageCountDate) return; // Already loaded
		const [count, date] = await Promise.all([
			this.ctx.storage.get<number>(MESSAGE_COUNT_KEY),
			this.ctx.storage.get<string>(MESSAGE_COUNT_DATE_KEY),
		]);
		this._messageCountToday = count ?? 0;
		this._messageCountDate = date ?? "";
	}

	/**
	 * Checks and enforces the daily message limit.
	 * Returns true if the message should be dropped (limit exceeded).
	 */
	private async checkMessageLimit(ws: WebSocket): Promise<boolean> {
		await this.restoreMessageCount();

		const today = new Date().toISOString().slice(0, 10);

		// Reset counter on new day
		if (this._messageCountDate !== today) {
			this._messageCountToday = 0;
			this._messageCountDate = today;
			this._messageLimitNotified = false;
			await this.ctx.storage.put(MESSAGE_COUNT_KEY, 0);
			await this.ctx.storage.put(MESSAGE_COUNT_DATE_KEY, today);
		}

		const meta = await this.getDeviceMeta();
		const plan: UserPlan = meta?.plan ?? "free";
		const limit = TIER_LIMITS[plan].maxMessagesPerDevicePerDay;

		if (this._messageCountToday >= limit) {
			if (!this._messageLimitNotified) {
				this._messageLimitNotified = true;
				const retryAfter = this.secondsUntilMidnightUtc();

				if (plan === "free") {
					// Free tier: send rate_limit, close connection, log
					ws.send(
						JSON.stringify({
							type: "rate_limit",
							payload: {
								error: "Daily message limit reached",
								retry_after: retryAfter,
							},
						}),
					);
					ws.close(WS_CLOSE_RATE_LIMITED, "Daily message limit reached");
					await this.persistLog(
						"warn",
						`Connection closed: daily message limit reached (${this._messageCountToday}/${limit}). Retry after ${retryAfter}s.`,
					);
				} else {
					// Paid tier: send notification but keep connection
					ws.send(
						JSON.stringify({
							type: "rate_limit",
							payload: {
								error: "Daily message limit reached",
							},
						}),
					);
				}
			}
			return true; // Drop the message
		}

		this._messageCountToday++;

		// Flush to storage periodically (every 50 messages) to survive hibernation
		if (
			this._messageCountToday % 50 === 0 ||
			this._messageCountToday >= limit
		) {
			await this.ctx.storage.put(MESSAGE_COUNT_KEY, this._messageCountToday);
			await this.ctx.storage.put(
				MESSAGE_COUNT_DATE_KEY,
				this._messageCountDate,
			);
		}

		return false;
	}

	/**
	 * Append a user-worker event to the persisted queue and arm the DO alarm
	 * to fire as soon as possible. Events are drained inside alarm() where
	 * the Worker Loader can be invoked reliably (unlike Hibernation-API
	 * webSocketMessage handlers, which hang on getTarget()).
	 */
	protected async enqueueUserWorkerEvent(event: PendingUserEvent) {
		await enqueueUserWorkerEvent(this.ctx.storage, event);
	}

	/**
	 * Drain any queued user-worker events. Called from alarm() before cron
	 * processing so onDeviceConnect / onMessage run in a fresh invocation.
	 * Returns the user worker it created so alarm() can reuse it for cron /
	 * legacy-onAlarm dispatch without triggering another LOADER.get() (which
	 * trips the "Too many concurrent dynamic workers" limit).
	 */
	protected async drainPendingUserWorkerEvents(): Promise<IUserDeviceWorker | null> {
		return drainPendingUserWorkerEvents({
			storage: this.ctx.storage,
			analytics: this.env.ANALYTICS,
			getOrCreateUserWorker: () => this.getOrCreateUserWorker(),
			initializeCrons: (worker) => this.initializeCrons(worker),
			deviceMeta: this.deviceMeta,
		});
	}

	protected async handleConnectionLost(reason: string) {
		// Capture connection start before clearing it, to record uptime. After
		// hibernation the in-memory field is gone, so fall back to storage.
		const connectedSince =
			this._connectedSince ??
			(await this.ctx.storage.get<number>(CONNECTED_SINCE_KEY));

		// Reject all pending commands because we can no longer receive responses.
		for (const [_id, command] of this.pendingCommands.entries()) {
			clearTimeout(command.timeoutId);
			command.reject(new Error(reason));
		}
		this.pendingCommands.clear();
		this._session = undefined;
		this._connectedSince = undefined;

		await this.ctx.storage.delete(CONNECTED_SINCE_KEY);

		// Notify watcher WebSockets of disconnection
		emitStatusEvent(this.ctx, { connected: false, connectedSince: null });

		// Update cached connection status in D1. deviceMeta may be absent after
		// hibernation, so fall back to reading it from durable storage.
		const meta = await this.getDeviceMeta();
		if (meta?.deviceId) {
			await this.env.DB.prepare("UPDATE devices SET connected = 0 WHERE id = ?")
				.bind(meta.deviceId)
				.run();

			// Usage metric: total connected time for this session. Recorded once
			// per disconnect (long-lived sessions only surface uptime on close).
			if (connectedSince) {
				recordDeviceUsage(this.env.USAGE, {
					deviceId: meta.deviceId,
					projectId: meta.projectId,
					userId: meta.userId,
					kind: "connection",
					connectedSeconds: Math.max(
						0,
						Math.round((Date.now() - connectedSince) / 1000),
					),
				});
			}
		}

		// Dispatch the user worker's onDeviceDisconnect lifecycle hook via the
		// deferred-event queue instead of invoking it here. handleConnectionLost
		// runs from the Hibernation API webSocketClose / webSocketError handlers,
		// and invoking the Worker Loader from a Hibernation-API handler
		// (getOrCreateUserWorker → getTarget, or any RPC into the dynamic user
		// worker) hangs indefinitely in production — the same reason
		// onDeviceConnect / onMessage are queued (see enqueueUserWorkerEvent and
		// webSocketMessage). A hung invocation here also wedged the dynamic-worker
		// slot, which left the device unable to receive any command on the next
		// reconnect (firmware stuck on the "Server" screen after a
		// disconnect/reconnect cycle). The queued event is drained from alarm() —
		// a safe, non-hibernation context — at the top of the drain, before the
		// connection-gate check, so it still runs for a now-disconnected device.
		await this.enqueueUserWorkerEvent({ kind: "disconnect" });
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
			this._hasCrons = false;
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
				// Preserve the scheduled fire time only if the cron is unchanged AND
				// that time is still in the future. A fire time now in the past means
				// a slot elapsed while the device was offline — recompute the next
				// occurrence so the missed fire is skipped rather than firing
				// immediately on reconnect. This keeps the documented "missed fire is
				// skipped; it does not catch up" contract (docs/concepts/cron-scheduling)
				// while still not delaying a near-due cron across a brief reconnect.
				const nextFireAt =
					prev && prev.cron === expr && prev.nextFireAt > now
						? prev.nextFireAt
						: nextCronTime(expr, now);
				storage[name] = { cron: expr, nextFireAt };
			} catch (err) {
				logger.warn("Invalid cron expression", {
					name: name.slice(0, 64),
					error: (err as Error).message,
				});
			}
		}

		if (Object.keys(storage).length === 0) {
			// All cron expressions were invalid — clear any stale schedule so old crons
			// don't keep firing with now-invalid expressions.
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
			await this.ctx.storage.deleteAlarm();
			this._hasCrons = false;
			return;
		}

		await this.ctx.storage.put(CRON_STORAGE_KEY, storage);
		this._hasCrons = true;

		await this.ctx.storage.setAlarm(earliestFireTime(storage));
	}

	/**
	 * Re-arm the per-device cron alarm from the schedule already in storage,
	 * independent of the `device_connected` handshake. Called from the device
	 * connect handler when a "device"-tagged WebSocket is accepted.
	 *
	 * Why this exists: alarm()'s cost guard calls deleteAlarm() whenever it fires
	 * with no device socket present, so a disconnected device stops waking the DO.
	 * The only other re-arm path, initializeCrons(), runs only after a fresh
	 * `device_connected` message is drained. If a connection is re-established
	 * without that message being processed (a transport-level reconnect, or a
	 * half-open socket the runtime later replaces), the cron would stay cancelled
	 * forever even though the device is back. Re-arming from the persisted
	 * schedule here closes that gap — and needs no user Worker, so it is safe to
	 * call directly from the connect handler.
	 *
	 * A stored fire time now in the past (a slot elapsed while offline) is
	 * recomputed to the next occurrence so the missed fire is skipped rather than
	 * firing an immediate catch-up — matching initializeCrons() and the documented
	 * "missed fires do not catch up" contract. An already-scheduled, sooner alarm
	 * (e.g. a pending-event drain) is never pushed out.
	 */
	protected async rearmCronAlarmFromStorage(): Promise<void> {
		const schedules = await this.ctx.storage.get<CronStorage>(CRON_STORAGE_KEY);
		if (!schedules || Object.keys(schedules).length === 0) {
			// No per-device crons — nothing to re-arm.
			return;
		}

		const now = Date.now();
		let changed = false;
		for (const [name, entry] of Object.entries(schedules)) {
			if (entry.nextFireAt <= now) {
				try {
					schedules[name] = {
						cron: entry.cron,
						nextFireAt: nextCronTime(entry.cron, now),
					};
					changed = true;
				} catch {
					// Invalid expression — leave the stale entry; resolveDueCrons()
					// logs and drops it on the next alarm fire.
				}
			}
		}
		if (changed) {
			await this.ctx.storage.put(CRON_STORAGE_KEY, schedules);
		}
		this._hasCrons = true;

		const target = earliestFireTime(schedules);
		const existing = await this.ctx.storage.getAlarm();
		if (existing === null || target < existing) {
			await this.ctx.storage.setAlarm(target);
		}
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
		// Invalidate any user-worker stub cached by a *previous* DO invocation.
		// getOrCreateUserWorker caches the resolved getTarget() handle, but that
		// handle is a child-isolate RPC stub scoped to the invocation that created
		// it (see .claude/skills/cloudflare-runtime-limitations: "getTarget()
		// returns are RPC handles too"). Reusing it across invocations is stale:
		// calling onCron/onDeviceConnect on a cross-invocation stub fans out
		// subrequests that never resolve, blowing the per-invocation subrequest
		// cap (60s wall / 0 cpu) and wedging the device — which then starves its
		// WebSocket ping/pong and makes the firmware reconnect every few minutes.
		// Clearing here forces a fresh resolve for this invocation; the resolved
		// worker is still reused *within* this tick via the threaded `drainedWorker`
		// (and the in-invocation cache), so we never resolve more than once a tick.
		this.cachedUserWorker = null;

		// Drain any queued onDeviceConnect / onMessage events first — they
		// were deferred here from webSocketMessage because the Worker Loader
		// can't be invoked from a Hibernation-API event handler.
		// Reuse the returned worker below to avoid a second LOADER.get() call
		// in this same alarm tick.
		// Any new event enqueued during drain will arm its own alarm via
		// enqueueUserWorkerEvent (see device.ts setAlarm there), so we don't
		// need to re-read PENDING_USER_EVENTS_KEY here just to detect that.
		// [DIAG] Temporary instrumentation for the "Too many subrequests" alarm
		// wedge (remove once root-caused). One wedged alarm in `wrangler tail`
		// then reveals whether the per-invocation subrequest fan-out is the
		// pending-event backlog (pendingEvents large), an accumulation of
		// zombie device/watcher sockets, or the drain vs onCron phase (timings).
		const _diagT0 = Date.now();
		let _diagPending = 0;
		try {
			_diagPending =
				(
					await this.ctx.storage.get<PendingUserEvent[]>(
						PENDING_USER_EVENTS_KEY,
					)
				)?.length ?? 0;
		} catch {}
		const _diagAnomalous =
			_diagPending > 0 ||
			this.ctx.getWebSockets("device").length > 1 ||
			this.ctx.getWebSockets("watcher").length > 0;
		if (_diagAnomalous) {
			logger.warn("[DIAG] alarm entry counts", {
				deviceId: this.deviceMeta?.deviceId,
				pendingEvents: _diagPending,
				deviceSockets: this.ctx.getWebSockets("device").length,
				watcherSockets: this.ctx.getWebSockets("watcher").length,
			});
		}

		const drainedWorker = await this.drainPendingUserWorkerEvents();

		if (_diagAnomalous) {
			logger.warn("[DIAG] alarm post-drain", {
				deviceId: this.deviceMeta?.deviceId,
				drainMs: Date.now() - _diagT0,
				deviceSocketsAfterDrain: this.ctx.getWebSockets("device").length,
			});
		}

		// Skip the cron-storage read entirely on devices we already know have
		// no crons — most devices fall here. _hasCrons is null after wake from
		// hibernation, so the first alarm post-wake still pays for one read.
		if (this._hasCrons === false) {
			let legacyWorker = drainedWorker;
			if (!legacyWorker) {
				try {
					legacyWorker = await this.getOrCreateUserWorker();
				} catch (err) {
					logger.error(err, "Worker unavailable during alarm (legacy path)", {
						deviceId: this.deviceMeta?.deviceId,
					});
					return;
				}
			}
			if (legacyWorker?.onAlarm) {
				try {
					await legacyWorker.onAlarm();
				} catch (error) {
					logger.error(error, "Error in user worker onAlarm", {
						deviceId: this.deviceMeta?.deviceId,
					});
				}
			}
			return;
		}

		const schedules = await this.ctx.storage.get<CronStorage>(CRON_STORAGE_KEY);
		this._hasCrons = !!(schedules && Object.keys(schedules).length > 0);

		if (!schedules || Object.keys(schedules).length === 0) {
			// No cron schedules. Only fetch a worker if we didn't already
			// get one from drain; and only if we actually need to dispatch
			// onAlarm (which depends on the user script defining it).
			let legacyWorker = drainedWorker;
			if (!legacyWorker) {
				try {
					legacyWorker = await this.getOrCreateUserWorker();
				} catch (err) {
					logger.error(err, "Worker unavailable during alarm (legacy path)", {
						deviceId: this.deviceMeta?.deviceId,
					});
					return;
				}
			}
			if (legacyWorker?.onAlarm) {
				try {
					await legacyWorker.onAlarm();
				} catch (error) {
					logger.error(error, "Error in user worker onAlarm", {
						deviceId: this.deviceMeta?.deviceId,
					});
				}
			}
			return;
		}

		// Cost guard: only fire cron schedules while a device is actually
		// connected. A script that declares a frequent cron (e.g. "*/1 * * * *")
		// would otherwise keep waking this Durable Object — and re-invoking the
		// user Worker — every minute forever after the device disconnects,
		// billing for work that can never reach hardware. When no device socket
		// is present we cancel the alarm and leave the schedule in storage;
		// initializeCrons() re-arms it on the next reconnect (preserving each
		// cron's nextFireAt). We skip deletion if events were re-queued for a
		// transient retry above, since drainPendingUserWorkerEvents armed its own
		// alarm for them and we must not cancel that retry.
		if (this.ctx.getWebSockets("device").length === 0) {
			const stillPending = await this.ctx.storage.get<PendingUserEvent[]>(
				PENDING_USER_EVENTS_KEY,
			);
			if (!stillPending || stillPending.length === 0) {
				await this.ctx.storage.deleteAlarm();
			}
			return;
		}

		const now = Date.now();

		// Guard: if the worker is unavailable, reschedule without advancing so cron
		// firings are not silently lost. The alarm will retry when the next
		// nextFireAt arrives (or after 60 s minimum).
		let userWorker: IUserDeviceWorker | null = drainedWorker;
		if (!userWorker) {
			try {
				userWorker = await this.getOrCreateUserWorker();
			} catch (err) {
				logger.error(
					err,
					"Worker unavailable during alarm — rescheduling without advancing cron schedule",
					{ deviceId: this.deviceMeta?.deviceId },
				);
				await this.ctx.storage.setAlarm(
					Math.max(Date.now() + 60_000, earliestFireTime(schedules)),
				);
				return;
			}
		}

		// Guard: getOrCreateUserWorker could theoretically return null (e.g. if the
		// implementation changes). Treat null like an exception — reschedule without
		// advancing so cron firings are not silently lost.
		if (userWorker === null) {
			logger.error(
				new Error("Worker returned null during alarm"),
				"Worker returned null during alarm — rescheduling without advancing cron schedule",
				{ deviceId: this.deviceMeta?.deviceId },
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
			logger.warn(
				"getCrons() RPC failed during alarm — falling back to stored cron expressions",
				{
					deviceId: this.deviceMeta?.deviceId,
					error: (err as Error).message,
				},
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
			logger.error(
				err,
				"Error resolving due crons — rescheduling without advancing",
				{ deviceId: this.deviceMeta?.deviceId },
			);
			await this.ctx.storage.setAlarm(
				Math.max(Date.now() + 60_000, earliestFireTime(schedules)),
			);
			return;
		}

		// Dispatch onCron for each due schedule
		for (const name of due) {
			if (userWorker.onCron) {
				// [DIAG] time onCron so we can tell whether the subrequest
				// exhaustion happens inside onCron or was already spent before it.
				const _diagCronStart = Date.now();
				try {
					await userWorker.onCron(name);
				} catch (error) {
					logger.error(error, "Error in user worker onCron", {
						cronName: name.slice(0, 64),
						deviceId: this.deviceMeta?.deviceId,
						diagOnCronMs: Date.now() - _diagCronStart,
						diagAlarmMs: Date.now() - _diagT0,
					});
				}
			}
		}

		// Usage metric: each due cron is one user-worker invocation (billable
		// compute). Recorded once per alarm with the batch count.
		if (due.length > 0 && this.deviceMeta) {
			recordDeviceUsage(this.env.USAGE, {
				deviceId: this.deviceMeta.deviceId,
				projectId: this.deviceMeta.projectId,
				userId: this.deviceMeta.userId,
				kind: "cron_fire",
				cronFires: due.length,
			});
		}

		// Persist updated schedule and reschedule the next alarm
		if (Object.keys(updated).length > 0) {
			await this.ctx.storage.put(CRON_STORAGE_KEY, updated);
			await this.ctx.storage.setAlarm(earliestFireTime(updated));
			this._hasCrons = true;
		} else {
			// All crons were removed — clear stored schedule and cancel the
			// now-orphaned alarm so it doesn't fire a ghost wake-up.
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
			await this.ctx.storage.deleteAlarm();
			this._hasCrons = false;
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
	 * Persists a log entry from user code into DO SQLite storage and
	 * broadcasts it to watcher WebSockets. Called via DeviceSender RPC from
	 * the proxy entrypoint's console override. Implementation lives in
	 * `logStreaming.persistAndBroadcastLog`.
	 */
	async persistLog(level: string, message: string): Promise<void> {
		persistAndBroadcastLog(this.ctx, this.logStream, level, message);
	}

	/**
	 * @deprecated Retired May 2026. Always throws `LOGS_DEPRECATED`.
	 *
	 * **Why this is gone.** This RPC backed the HTTP `GET /v1/projects/.../logs`
	 * endpoint, which the CLI's `devicesdk logs --tail` polled every 2 s with a
	 * cursor-based fetch. A stale CLI process polled for 2 days, ran a
	 * `LIMIT 51` SQL scan against `device_logs` 43 200 times/day, and burned
	 * the production free-tier 1 M DO rows-read quota in ~5 h. Once the daily
	 * quota was exhausted every `/logs` request 503'd for the remainder of the
	 * UTC day. The polling loop never backed off.
	 *
	 * **What replaces it.** Watcher WebSocket \u2014 `handleWatcherUpgrade` (above)
	 * accepts `?backfillLimit=N&backfillLevel=warn` and emits replay frames
	 * before live broadcasts. One SQL scan per *connection* instead of per
	 * poll. Live events arrive via `broadcastToWatchers("log", ...)` so a
	 * silent device costs zero reads.
	 *
	 * **Defense in depth \u2014 even if a client tried to revive `/logs`:**
	 *   1. Cloudflare WAF rate-limit on `/v1/*` (see `docs/internal/operations/cloudflare-waf.md`).
	 *   2. `userBlockListMiddleware` (see `foundation/userBlockList.ts`) \u2014
	 *      tripping the per-route rate limit writes a 1 h block to KV that
	 *      short-circuits subsequent requests at L1 cache (`caches.default`).
	 *   3. Per-user rate limit on `/logs` (`userRateLimitMiddleware`,
	 *      mounted in `index.ts`).
	 *   4. This throw \u2014 even if the rate limiter is misconfigured, the DO RPC
	 *      itself refuses to scan storage.
	 *
	 * Keeping the method (rather than removing it) preserves the
	 * type-checked RPC surface of `BaseDevice` and gives a clear error to any
	 * accidental caller.
	 */
	async getLogs(_options: {
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
		throw new Error(
			"LOGS_DEPRECATED: stub.getLogs() was retired in May 2026 after a runaway --tail loop polled it for 2 days and burned the daily DO rows-read quota. Use the watcher WebSocket \u2014 handleWatcherUpgrade() supports `?backfillLimit=N&backfillLevel=warn` and broadcasts live entries via broadcastToWatchers('log', ...).",
		);
	}

	/**
	 * Returns the live WebSocket connection status of the device.
	 * Uses getWebSockets() which is always authoritative for Hibernation API connections.
	 */
	async getConnectionStatus(): Promise<{
		connected: boolean;
		connectedSince: number | null;
	}> {
		const sockets = this.ctx.getWebSockets("device");
		const connected = sockets.length > 0;
		// _connectedSince is in-memory only — set on connect, cleared on disconnect.
		// After hibernation it will be undefined even if a socket exists, which is acceptable
		// since connected_since is cosmetic (the connected boolean is always authoritative).
		const connectedSince = connected ? (this._connectedSince ?? null) : null;
		return { connected, connectedSince };
	}

	/**
	 * RPC entry point for user scripts calling `this.env.DEVICE.emitState(...)`.
	 * The user worker invokes this via DeviceSender; it broadcasts a `state`
	 * event with `source: "user"` to all watcher sockets.
	 */
	async emitState(entityId: string, value: unknown): Promise<void> {
		broadcastToWatchers(this.ctx, "state", {
			entity_id: entityId,
			value,
			source: "user",
		});
	}

	/**
	 * Sends a hardware command to the device and returns the result.
	 * Called from the sendCommand API endpoint.
	 */
	async handleCommand(
		command: Omit<DeviceCommand, "id">,
	): Promise<{ status: number; body: string }> {
		const sockets = this.ctx.getWebSockets("device");
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
		logger.debug("[reboot] Session check", {
			hasSession: !!session,
			readyState: session?.websocket.readyState,
		});

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

/// <reference path="./cloudflare-workers.d.ts" />

import { DurableObject } from "cloudflare:workers";
import type {
	DeviceEntrypoint,
	DeviceResponse,
	EnvVarsInterface,
} from "@devicesdk/core";
import { cronMatches } from "./cron.js";
import { LocalDeviceSender } from "./localDeviceSender.js";

type DeviceEntrypointClass = new (
	ctx: Record<string, unknown>,
	env: {
		DEVICE: LocalDeviceSender;
		DEVICES: Record<string, never>;
		VARS: EnvVarsInterface;
	},
) => DeviceEntrypoint;

// Bindings of the dev worker the bridge DO runs in. commands/dev.ts emits one
// text binding per CLI env var (binding name = env var name, capped at 100)
// plus a `DEVICESDK_VARS_KEYS` marker binding listing the carried keys.
const VARS_KEYS_BINDING = "DEVICESDK_VARS_KEYS";

interface BridgeEnv {
	[key: string]: string | undefined;
}

/**
 * VARS in the local simulator is a read-only view of the CLI process's
 * environment, shipped to workerd as per-var text bindings on the dev worker
 * (see buildEnvVarBindings in commands/dev.ts): workerd has no access to the
 * CLI's process.env, so the CLI enumerates its own env vars into bindings at
 * config-generation time and this bridge reads them back from the DO env,
 * enumerating via the keys-list marker binding. `getAll` returns a snapshot
 * copy so callers can't mutate it.
 */
function createProcessEnvVars(env: BridgeEnv): EnvVarsInterface {
	// Null prototype so hostile key names (`__proto__`) can't reach the
	// Object prototype through get/set.
	const source: Record<string, string> = Object.create(null);
	const keysRaw = env[VARS_KEYS_BINDING];
	if (typeof keysRaw === "string") {
		try {
			const keys: unknown = JSON.parse(keysRaw);
			if (Array.isArray(keys)) {
				for (const key of keys) {
					if (typeof key !== "string") continue;
					const value = env[key];
					if (typeof value === "string") source[key] = value;
				}
			}
		} catch {
			// Malformed binding - VARS stays empty rather than crashing the DO.
		}
	}
	return {
		async get(key: string): Promise<string | undefined> {
			return source[key];
		},
		async getAll(): Promise<Record<string, string>> {
			return { ...source };
		},
	};
}

/**
 * Creates a DurableObject class that bridges the simulator WebSocket
 * to a user's DeviceEntrypoint class.
 */
export function createDeviceBridge(DeviceClass: DeviceEntrypointClass) {
	return class DeviceBridge extends DurableObject<BridgeEnv> {
		userDevice?: DeviceEntrypoint;
		sender?: LocalDeviceSender;
		deviceId: string;
		cronTicker?: ReturnType<typeof setInterval>;
		// Names that already fired in the current UTC minute; cleared when the
		// minute rolls over so a cron fires at most once per matching minute
		// (missed minutes while offline are skipped, never caught up).
		cronFiredThisMinute = new Set<string>();
		cronMinuteKey = "";
		// Names whose onCron is still running: a long-running onCron must not
		// overlap the next minute's fire (the server serializes per device).
		cronInFlight = new Set<string>();

		constructor(ctx: DurableObjectState, env: BridgeEnv) {
			super(ctx, env);
			this.deviceId = "device";
		}

		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);

			if (url.pathname.endsWith("/websocket")) {
				return this._handleWebSocketUpgrade(request);
			}

			return new Response("Not found", { status: 404 });
		}

		_handleWebSocketUpgrade(request: Request): Response {
			const upgradeHeader = request.headers.get("Upgrade");
			// RFC 6455: header names are case-insensitive; some clients send
			// "WebSocket" / "WEBSOCKET".
			if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
				return new Response("Expected Upgrade: websocket", {
					status: 426,
				});
			}

			const url = new URL(request.url);
			this.deviceId = url.searchParams.get("deviceId") || "device";

			const pair = new WebSocketPair();
			const client = pair[0];
			const server = pair[1];

			this.ctx.acceptWebSocket(server);

			return new Response(null, {
				status: 101,
				// @ts-expect-error -- webSocket property exists in workerd runtime
				webSocket: client,
			});
		}

		async webSocketMessage(
			ws: WebSocket,
			data: ArrayBuffer | string,
		): Promise<void> {
			try {
				const message = JSON.parse(data as string) as DeviceResponse;

				if (message.type === "device_connected") {
					await this._initDevice(ws);
					return;
				}

				// Try to resolve a pending command
				if (this.sender?.handleResponse(message)) {
					return;
				}

				// Forward unsolicited messages to user code
				if (this.userDevice) {
					try {
						await this.userDevice.onMessage(message);
					} catch (error) {
						console.error(`[${this.deviceId}] Error in onMessage:`, error);
					}
				}
			} catch (error) {
				console.error(`[${this.deviceId}] Failed to parse message:`, error);
			}
		}

		async webSocketClose(
			_ws: WebSocket,
			code: number,
			reason: string,
		): Promise<void> {
			console.log(`[${this.deviceId}] WebSocket closed: ${code} ${reason}`);
			await this._cleanup();
		}

		async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
			console.error(`[${this.deviceId}] WebSocket error:`, error);
			await this._cleanup();
		}

		async _initDevice(ws: WebSocket): Promise<void> {
			const storage = this.ctx.storage as DurableObjectState["storage"];
			const kvStorage = {
				get: async <T = unknown>(key: string) => storage.get<T>(key),
				put: async <T>(key: string, value: T) => {
					await storage.put(key, value);
				},
				delete: async (key: string) => storage.delete(key),
			};

			this.sender = new LocalDeviceSender(ws, kvStorage);

			this.userDevice = new DeviceClass(
				{},
				{
					DEVICE: this.sender,
					DEVICES: {},
					VARS: createProcessEnvVars(this.env),
				},
			);

			console.log(
				`[${this.deviceId}] Device connected, calling onDeviceConnect`,
			);
			try {
				await this.userDevice.onDeviceConnect();
			} catch (error) {
				console.error(`[${this.deviceId}] Error in onDeviceConnect:`, error);
			}
			this.startCronTicker();
		}

		startCronTicker(): void {
			// Reconnect re-runs _initDevice; keep a single ticker per instance.
			if (this.cronTicker) return;
			// 1s tick is plenty for minute-granularity cron slots and keeps the
			// simulator deterministic.
			this.cronTicker = setInterval(() => {
				void this.tickCrons();
			}, 1000);
		}

		async tickCrons(): Promise<void> {
			const userDevice = this.userDevice;
			const crons = userDevice?.crons;
			if (!crons || Object.keys(crons).length === 0) return;

			const now = new Date();
			const minuteKey = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM UTC
			if (minuteKey !== this.cronMinuteKey) {
				this.cronMinuteKey = minuteKey;
				this.cronFiredThisMinute.clear();
			}

			for (const [name, expr] of Object.entries(crons)) {
				if (this.cronFiredThisMinute.has(name)) continue;
				// Skip while a previous onCron for this name is still running
				// so a slow handler can't overlap the next minute's fire.
				if (this.cronInFlight.has(name)) continue;
				if (!cronMatches(expr, now)) continue;
				this.cronFiredThisMinute.add(name);
				this.cronInFlight.add(name);
				try {
					await userDevice.onCron(name);
				} catch (error) {
					console.error(
						`[${this.deviceId}] Error in onCron("${name}"):`,
						error,
					);
				} finally {
					this.cronInFlight.delete(name);
				}
			}
		}

		async _cleanup(): Promise<void> {
			if (this.cronTicker) {
				clearInterval(this.cronTicker);
				this.cronTicker = undefined;
			}
			this.cronFiredThisMinute.clear();
			this.cronMinuteKey = "";
			this.cronInFlight.clear();
			if (this.sender) {
				this.sender.cleanup();
			}
			if (this.userDevice) {
				try {
					await this.userDevice.onDeviceDisconnect();
				} catch (error) {
					console.error(
						`[${this.deviceId}] Error in onDeviceDisconnect:`,
						error,
					);
				}
			}
			this.userDevice = undefined;
			this.sender = undefined;
		}
	};
}

/// <reference path="./cloudflare-workers.d.ts" />

import { DurableObject } from "cloudflare:workers";
import type { DeviceEntrypoint, DeviceResponse } from "@devicesdk/core";
import { LocalDeviceSender } from "./localDeviceSender.js";

type DeviceEntrypointClass = new (
	ctx: {},
	env: { DEVICE: LocalDeviceSender; DEVICES: {} },
) => DeviceEntrypoint;

/**
 * Creates a DurableObject class that bridges the simulator WebSocket
 * to a user's DeviceEntrypoint class.
 */
export function createDeviceBridge(DeviceClass: DeviceEntrypointClass) {
	return class DeviceBridge extends DurableObject {
		userDevice?: DeviceEntrypoint;
		sender?: LocalDeviceSender;
		deviceId: string;

		constructor(ctx: DurableObjectState, env: unknown) {
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
			if (!upgradeHeader || upgradeHeader !== "websocket") {
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
				{ DEVICE: this.sender, DEVICES: {} },
			);

			console.log(
				`[${this.deviceId}] Device connected, calling onDeviceConnect`,
			);
			try {
				await this.userDevice.onDeviceConnect();
			} catch (error) {
				console.error(`[${this.deviceId}] Error in onDeviceConnect:`, error);
			}
		}

		async _cleanup(): Promise<void> {
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

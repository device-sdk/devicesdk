import { DurableObject } from "cloudflare:workers";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
} from "@devicesdk/core";
import type { Env } from "../../types";
import { getProxyEntrypoint } from "./classProxy";
import type { IUserDeviceWorker } from "./userWorkerTypes";

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
	private _session?: DeviceSession;
	private pendingCommands: Map<string, PendingCommand> = new Map();

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
		} else if (request.method === "POST") {
			return this.handleCommandRequest(request);
		}

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
						// Provide the Logger binding for logging from user code
						LOGGER: (this.ctx as any).exports.Logger({
							props: { deviceId, projectId },
						}),
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
	 * Handles an incoming command via HTTP POST, sends it to the device,
	 * and waits for a response or timeout.
	 */
	async handleCommandRequest(request: Request) {
		const session = this.getSession();
		if (
			!session ||
			session.websocket.readyState !== WebSocket.READY_STATE_OPEN
		) {
			return new Response("Device not connected", { status: 503 });
		}

		try {
			// We need to add an ID to the command before sending.
			const partialCommand = await request.json<Omit<DeviceCommand, "id">>();
			const command: DeviceCommand = {
				...partialCommand,
				id: crypto.randomUUID(),
			} as DeviceCommand;

			// Send the command and wait for the device's response.
			const response = await this.sendCommandAndWaitForResponse(command);

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "An unknown error occurred";
			return new Response(errorMessage, { status: 500 });
		}
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

		try {
			const message = JSON.parse(data as string) as DeviceResponse;

			// Handle device connect message
			if (message.type === "device_connected") {
				// console.log("Device connect message received, calling onDeviceConnect");
				const userWorker = await this.getOrCreateUserWorker();
				try {
					await userWorker.onDeviceConnect();
				} catch (error) {
					console.error("Error in user worker onDeviceConnect:", error);
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
	 * Handle alarms - forward to user worker if available
	 */
	async alarm(): Promise<void> {
		const userWorker = await this.getOrCreateUserWorker();
		if (userWorker?.onAlarm) {
			try {
				await userWorker.onAlarm();
			} catch (error) {
				console.error("Error in user worker onAlarm:", error);
			}
		}
	}

	/**
	 * KV storage methods for user scripts
	 */
	async kvGet<T = unknown>(key: string): Promise<T | undefined> {
		return this.ctx.storage.get<T>(key);
	}

	async kvPut<T>(key: string, value: T): Promise<void> {
		await this.ctx.storage.put(key, value);
	}

	async kvDelete(key: string): Promise<boolean> {
		return this.ctx.storage.delete(key);
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

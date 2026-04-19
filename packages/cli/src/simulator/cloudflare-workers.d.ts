// Minimal module shims for the workerd runtime globals used by deviceBridge.ts.
// At runtime `cloudflare:workers` is provided by workerd; these declarations
// exist only so tsc can type-check the file without @cloudflare/workers-types.

declare module "cloudflare:workers" {
	export class DurableObject<Env = unknown> {
		ctx: DurableObjectState;
		env: Env;
		constructor(ctx: DurableObjectState, env: Env);
		fetch?(request: Request): Promise<Response> | Response;
		webSocketMessage?(
			ws: WebSocket,
			message: ArrayBuffer | string,
		): Promise<void> | void;
		webSocketClose?(
			ws: WebSocket,
			code: number,
			reason: string,
			wasClean: boolean,
		): Promise<void> | void;
		webSocketError?(ws: WebSocket, error: unknown): Promise<void> | void;
	}
}

interface DurableObjectState {
	storage: {
		get<T = unknown>(key: string): Promise<T | undefined>;
		put<T = unknown>(key: string, value: T): Promise<void>;
		delete(key: string): Promise<boolean>;
	};
	acceptWebSocket(ws: WebSocket): void;
	getWebSockets(): WebSocket[];
}

declare class WebSocketPair {
	0: WebSocket;
	1: WebSocket;
}

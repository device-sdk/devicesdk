import type { ServerWebSocket } from "bun";
import { createBunWebSocket } from "hono/bun";

/**
 * Single createBunWebSocket instance shared by the route handlers
 * (upgradeWebSocket middleware) and Bun.serve (websocket handler object).
 * They must come from the same call or upgrades never reach the handlers.
 */
export const { upgradeWebSocket, websocket } =
	createBunWebSocket<ServerWebSocket>();

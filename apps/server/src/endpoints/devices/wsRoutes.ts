import type { Hono } from "hono";
import { logger } from "../../foundation/logger";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { DeviceMeta, RuntimeSocket } from "../../runtime/types";
import type {
	AppContext,
	Env,
	tableDeviceScripts,
	Variables,
} from "../../types";
import { upgradeWebSocket } from "../../ws";

interface ConnectContext {
	meta: DeviceMeta;
}

interface WatchContext {
	projectUuid: string;
	deviceUuid: string;
	backfillLimit?: number;
	backfillLevel?: string;
}

type App = Hono<{ Bindings: Env; Variables: Variables }>;

/**
 * Stable socket adapter — hono may hand a fresh WSContext wrapper to each
 * event callback, so sessions key identity off this closure-scoped object.
 */
function makeStableSocket(): {
	sock: RuntimeSocket;
	bind: (ws: {
		send(d: string): void;
		close(c?: number, r?: string): void;
	}) => void;
} {
	let inner: {
		send(d: string): void;
		close(c?: number, r?: string): void;
	} | null = null;
	return {
		sock: {
			send: (d) => inner?.send(d),
			close: (c, r) => inner?.close(c, r),
		},
		bind: (ws) => {
			inner = ws;
		},
	};
}

/**
 * Device + watcher WebSocket routes. Plain Hono routes (not Chanfana
 * OpenAPIRoute classes) because the upgrade must be performed by the
 * upgradeWebSocket middleware; validation runs in a preceding handler that
 * either returns an error response or stashes context for the upgrade.
 * Mounted after authenticateUser, so both routes are authenticated; project
 * and device IDs reaching the runtime are server-derived (never client input).
 */
export function registerDeviceWsRoutes(app: App): void {
	// ---------------------------------------------------------- device socket
	app.get(
		"/v1/projects/:projectId/devices/:deviceId/connect/websocket",
		async (c, next) => {
			const upgradeHeader = c.req.header("Upgrade");
			if (upgradeHeader !== "websocket") {
				return c.json(
					{ success: false, error: "Expected Upgrade: websocket" },
					426,
				);
			}

			const ctx = c as unknown as AppContext;
			const user = c.get("user");
			const qb = c.get("qb");
			const { projectId, deviceId } = c.req.param();

			const resolved = await resolveProjectAndDevice(ctx, projectId, deviceId);
			if (resolved instanceof Response) return resolved;
			const { project, device } = resolved;

			let versionId = c.req.query("versionId") ?? "latest";
			if (versionId === "latest") {
				versionId = device.current_version_id as string;
			}

			const version = await qb
				.fetchOne<tableDeviceScripts>({
					tableName: "device_scripts",
					where: {
						conditions: ["version_id = ?"],
						params: [versionId],
					},
				})
				.execute()
				.then((d) => d.results);

			if (!version) {
				return c.json({ success: false, error: "Version not found" }, 404);
			}

			c.set(
				"wsConnect" as never,
				{
					meta: {
						userId: user.id,
						projectId: project.id,
						deviceId: device.id,
						// Slugs locate the script blob (UUIDs do not appear in keys).
						projectSlug: projectId,
						deviceSlug: deviceId,
						versionId,
						entrypointName: version.entrypoint,
					},
				} satisfies ConnectContext as never,
			);
			await next();
		},
		upgradeWebSocket((c) => {
			const { meta } = c.get("wsConnect" as never) as ConnectContext;
			const hub = (c.env as Env).DEVICE;
			const session = hub.get(meta.projectId, meta.deviceId);
			const { sock, bind } = makeStableSocket();
			return {
				onOpen(_evt, ws) {
					bind(ws);
					session.handleDeviceOpen(sock, meta);
				},
				onMessage(evt, ws) {
					bind(ws);
					session.handleDeviceMessage(
						sock,
						typeof evt.data === "string" ? evt.data : (evt.data as ArrayBuffer),
					);
				},
				onClose(evt) {
					session.handleDeviceClose(sock, evt.code, evt.reason);
				},
				onError(evt) {
					session.handleDeviceError(sock, evt);
				},
			};
		}),
	);

	// --------------------------------------------------------- watcher socket
	app.get(
		"/v1/projects/:projectId/devices/:deviceId/watch",
		async (c, next) => {
			const upgradeHeader = c.req.header("Upgrade");
			if (upgradeHeader !== "websocket") {
				return c.json(
					{ success: false, error: "Expected Upgrade: websocket" },
					426,
				);
			}

			const ctx = c as unknown as AppContext;
			const { projectId, deviceId } = c.req.param();
			const resolved = await resolveProjectAndDevice(ctx, projectId, deviceId);
			if (resolved instanceof Response) return resolved;
			const { project, device } = resolved;

			const rawLimit = c.req.query("backfillLimit");
			const parsedLimit =
				rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : undefined;

			c.set(
				"wsWatch" as never,
				{
					projectUuid: project.id,
					deviceUuid: device.id,
					backfillLimit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
					backfillLevel: c.req.query("backfillLevel"),
				} satisfies WatchContext as never,
			);
			await next();
		},
		upgradeWebSocket((c) => {
			const ctx = c.get("wsWatch" as never) as WatchContext;
			const hub = (c.env as Env).DEVICE;
			const session = hub.get(ctx.projectUuid, ctx.deviceUuid);
			const { sock, bind } = makeStableSocket();
			return {
				onOpen(_evt, ws) {
					bind(ws);
					try {
						session.attachWatcher(sock, {
							backfillLimit: ctx.backfillLimit,
							backfillLevel: ctx.backfillLevel,
						});
					} catch (error) {
						logger.error(error, "Watcher attach failed");
					}
				},
				onClose() {
					session.detachWatcher(sock);
				},
				onError() {
					session.detachWatcher(sock);
				},
			};
		}),
	);
}

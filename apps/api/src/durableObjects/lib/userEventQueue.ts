import type { DeviceResponse } from "@devicesdk/core";
import { recordWorkerLoaderFailure } from "../../foundation/analytics";
import { logger } from "../../foundation/logger";
import type { IUserDeviceWorker } from "./userWorkerTypes";

// Queue of user-worker events to dispatch on the next alarm firing.
// Hibernation-API webSocketMessage handlers cannot reliably invoke the Worker
// Loader (the getTarget() RPC hangs), so onDeviceConnect / onMessage get
// deferred to a fresh alarm() invocation where Worker Loader works.
export const PENDING_USER_EVENTS_KEY = "__internal:pending_user_events";

// Transient errors re-queue with backoff; persistent errors drop immediately.
// Patterns are matched as substrings against the thrown error's `.message`,
// which (after the wrapper in getOrCreateUserWorker) includes the underlying
// loader/runtime error text.
export const MAX_USER_EVENT_ATTEMPTS = 6;
export const TRANSIENT_ERROR_PATTERNS = [
	"Too many concurrent dynamic workers",
	"ECONNREFUSED",
];

export type PendingUserEvent =
	| { kind: "connect"; attempts?: number }
	| { kind: "message"; message: DeviceResponse; attempts?: number };

/**
 * Append a user-worker event to the persisted queue and arm the DO alarm
 * to fire as soon as possible.
 */
export async function enqueueUserWorkerEvent(
	storage: DurableObjectStorage,
	event: PendingUserEvent,
): Promise<void> {
	const existing =
		(await storage.get<PendingUserEvent[]>(PENDING_USER_EVENTS_KEY)) ?? [];
	existing.push(event);
	await storage.put(PENDING_USER_EVENTS_KEY, existing);

	const soon = Date.now() + 10;
	const currentAlarm = await storage.getAlarm();
	if (currentAlarm === null || currentAlarm > soon) {
		await storage.setAlarm(soon);
	}
}

export interface DrainDeps {
	storage: DurableObjectStorage;
	analytics?: AnalyticsEngineDataset;
	getOrCreateUserWorker: () => Promise<IUserDeviceWorker>;
	initializeCrons: (worker: IUserDeviceWorker) => Promise<void>;
	deviceMeta?: {
		userId: string;
		projectId: string;
		deviceId: string;
		versionId: string;
	};
}

/**
 * Drain queued user-worker events. Returns the user worker created so the
 * caller can reuse it for cron / legacy-onAlarm dispatch without another
 * LOADER.get() (which would trip the "Too many concurrent dynamic workers"
 * limit).
 *
 * Transient errors re-queue with exponential backoff; persistent errors drop
 * the batch and capture to Sentry via logger.error.
 */
export async function drainPendingUserWorkerEvents(
	deps: DrainDeps,
): Promise<IUserDeviceWorker | null> {
	const {
		storage,
		analytics,
		getOrCreateUserWorker,
		initializeCrons,
		deviceMeta,
	} = deps;

	const pending = await storage.get<PendingUserEvent[]>(
		PENDING_USER_EVENTS_KEY,
	);
	if (!pending || pending.length === 0) return null;

	// Clear up-front so a subsequent enqueue during processing doesn't get
	// swallowed if we persist an emptied array at the end.
	await storage.delete(PENDING_USER_EVENTS_KEY);

	let userWorker: IUserDeviceWorker;
	try {
		userWorker = await getOrCreateUserWorker();
	} catch (err) {
		const message = (err as Error)?.message ?? "";
		const isTransient = TRANSIENT_ERROR_PATTERNS.some((p) =>
			message.includes(p),
		);
		if (isTransient) {
			// Re-queue with exponential backoff so we retry once the
			// rate-limiter / transient condition clears. Bump every event's
			// attempt count, then split into events still under the cap
			// (re-queued) and events that just hit the cap (dropped).
			const bumped = pending.map((e) => ({
				...e,
				attempts: (e.attempts ?? 0) + 1,
			}));
			const retryable = bumped.filter(
				(e) => e.attempts < MAX_USER_EVENT_ATTEMPTS,
			);
			const dropped = bumped.filter(
				(e) => e.attempts >= MAX_USER_EVENT_ATTEMPTS,
			);

			// Any event that exhausted its retries is lost — surface it to
			// Sentry even when the rest of the batch is still retryable, so the
			// "operators see dropped events" contract holds for partial drops.
			if (dropped.length > 0) {
				logger.error(
					err,
					"user worker drain: transient failure, max attempts reached, dropping events",
					{
						droppedCount: dropped.length,
						kinds: dropped.map((e) => e.kind),
						...deviceMeta,
					},
				);
				recordWorkerLoaderFailure(analytics, {
					failureKind: "transient",
					errorName: (err as Error)?.name,
					attemptCount: MAX_USER_EVENT_ATTEMPTS,
					deviceId: deviceMeta?.deviceId,
					projectId: deviceMeta?.projectId,
				});
			}

			if (retryable.length > 0) {
				const maxAttempts = Math.max(...retryable.map((e) => e.attempts ?? 0));
				const backoffMs = Math.min(30_000, 500 * 2 ** maxAttempts);
				await storage.put(PENDING_USER_EVENTS_KEY, retryable);
				const currentAlarm = await storage.getAlarm();
				const nextFire = Date.now() + backoffMs;
				if (currentAlarm === null || currentAlarm > nextFire) {
					await storage.setAlarm(nextFire);
				}
				logger.warn("Worker init transient failure; re-queued events", {
					count: retryable.length,
					backoffMs,
					message,
				});
				recordWorkerLoaderFailure(analytics, {
					failureKind: "transient",
					errorName: (err as Error)?.name,
					attemptCount: maxAttempts,
					deviceId: deviceMeta?.deviceId,
					projectId: deviceMeta?.projectId,
				});
			}
		} else {
			// Persistent error (SyntaxError, script missing, etc.) — drop.
			logger.error(
				err,
				"user worker drain: persistent failure, dropping batch",
				{
					droppedCount: pending.length,
					kinds: pending.map((e) => e.kind),
					...deviceMeta,
				},
			);
			recordWorkerLoaderFailure(analytics, {
				failureKind: "persistent",
				errorName: (err as Error)?.name,
				attemptCount: 1,
				deviceId: deviceMeta?.deviceId,
				projectId: deviceMeta?.projectId,
			});
		}
		return null;
	}

	let connectProcessed = false;
	for (const event of pending) {
		try {
			if (event.kind === "connect") {
				await userWorker.onDeviceConnect();
				connectProcessed = true;
			} else {
				await userWorker.onMessage(event.message);
			}
		} catch (error) {
			logger.error(
				error,
				`Error in user worker ${event.kind === "connect" ? "onDeviceConnect" : "onMessage"} (via alarm)`,
				{
					kind: event.kind,
					userId: deviceMeta?.userId,
					deviceId: deviceMeta?.deviceId,
				},
			);
		}
	}

	// Initialize cron schedules once per batch if a connect was processed.
	if (connectProcessed) {
		try {
			await initializeCrons(userWorker);
		} catch (error) {
			logger.error(error, "Error initializing cron schedules", {
				deviceId: deviceMeta?.deviceId,
			});
		}
	}

	return userWorker;
}

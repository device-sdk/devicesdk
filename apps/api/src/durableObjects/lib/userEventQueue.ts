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

// Upper bound on how many events a single alarm invocation will dispatch.
// Each event is a cross-worker RPC into the user Worker (plus that handler's
// own subrequests), and a Worker invocation has a hard per-invocation
// subrequest cap. A device that churns connections or chats unsolicited
// messages while its alarm is paused (e.g. disconnected) can build a large
// backlog; draining it all in one alarm blows the subrequest cap, which aborts
// the invocation *before* it can dispatch crons or even trim the queue — so the
// backlog never shrinks and the device wedges forever. Capping the batch keeps
// every invocation well under the cap; the remainder is re-queued and a
// follow-up alarm continues draining.
export const MAX_DRAIN_BATCH = 50;

// Hard ceiling on the queue length. enqueue drops the oldest events past this
// so a misbehaving/looping device can never grow the backlog without bound
// (which would cost storage and slow every drain). Comfortably larger than
// MAX_DRAIN_BATCH so normal bursts are never truncated.
export const MAX_PENDING_EVENTS = 500;

export type PendingUserEvent =
	| { kind: "connect"; attempts?: number }
	| { kind: "message"; message: DeviceResponse; attempts?: number };

/**
 * Append a user-worker event to the persisted queue and arm the DO alarm
 * to fire as soon as possible.
 *
 * Two guards keep the queue bounded:
 *   - Redundant `connect` events are coalesced. onDeviceConnect is re-run on
 *     every reconnect and is meant to be idempotent, so queuing N of them just
 *     multiplies drain cost for no benefit — if a connect is already pending we
 *     skip appending another (but still bump the alarm so it drains promptly).
 *   - The queue is hard-capped at MAX_PENDING_EVENTS; the oldest events past the
 *     cap are dropped so a churning/chatty device cannot grow it unbounded.
 */
export async function enqueueUserWorkerEvent(
	storage: DurableObjectStorage,
	event: PendingUserEvent,
): Promise<void> {
	const existing =
		(await storage.get<PendingUserEvent[]>(PENDING_USER_EVENTS_KEY)) ?? [];

	const connectAlreadyQueued =
		event.kind === "connect" && existing.some((e) => e.kind === "connect");

	if (!connectAlreadyQueued) {
		existing.push(event);
		// Drop oldest events beyond the cap so the backlog stays drainable.
		if (existing.length > MAX_PENDING_EVENTS) {
			const overflow = existing.length - MAX_PENDING_EVENTS;
			existing.splice(0, overflow);
			logger.warn("Pending user-event queue full; dropped oldest events", {
				droppedCount: overflow,
				cap: MAX_PENDING_EVENTS,
			});
		}
		await storage.put(PENDING_USER_EVENTS_KEY, existing);
	}

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
 * Arm the alarm to fire at `at` unless an earlier alarm is already set.
 * Never pushes out a sooner pending alarm (e.g. a cron about to fire).
 */
async function armAlarmNoLaterThan(
	storage: DurableObjectStorage,
	at: number,
): Promise<void> {
	const currentAlarm = await storage.getAlarm();
	if (currentAlarm === null || currentAlarm > at) {
		await storage.setAlarm(at);
	}
}

/**
 * Drain queued user-worker events. Returns the user worker created so the
 * caller can reuse it for cron / legacy-onAlarm dispatch without another
 * LOADER.get() (which would trip the "Too many concurrent dynamic workers"
 * limit).
 *
 * At most MAX_DRAIN_BATCH events are dispatched per call so one invocation
 * cannot exhaust the runtime's per-invocation subrequest budget. Any remainder
 * is left on the queue and a follow-up alarm is armed to continue draining.
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

	// Process at most MAX_DRAIN_BATCH this invocation; persist the remainder
	// up-front so the tail survives even if this invocation dies, and so a
	// concurrent enqueue appends to the right tail.
	const batch = pending.slice(0, MAX_DRAIN_BATCH);
	const rest = pending.slice(MAX_DRAIN_BATCH);
	if (rest.length > 0) {
		await storage.put(PENDING_USER_EVENTS_KEY, rest);
	} else {
		await storage.delete(PENDING_USER_EVENTS_KEY);
	}

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
			const bumped = batch.map((e) => ({
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

			// Put the retryable batch back in front of any untouched remainder so
			// FIFO order is preserved across the bounded drain.
			const requeued = [...retryable, ...rest];
			if (requeued.length > 0) {
				const maxAttempts = Math.max(...retryable.map((e) => e.attempts ?? 0));
				const backoffMs = Math.min(30_000, 500 * 2 ** maxAttempts);
				await storage.put(PENDING_USER_EVENTS_KEY, requeued);
				await armAlarmNoLaterThan(storage, Date.now() + backoffMs);
				logger.warn("Worker init transient failure; re-queued events", {
					count: retryable.length,
					remainder: rest.length,
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
			// Persistent error (SyntaxError, script missing, etc.) — drop this
			// batch. The remainder (already persisted) is left for a follow-up
			// alarm so a single bad batch doesn't strand the rest of the queue.
			logger.error(
				err,
				"user worker drain: persistent failure, dropping batch",
				{
					droppedCount: batch.length,
					kinds: batch.map((e) => e.kind),
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
			if (rest.length > 0) {
				await armAlarmNoLaterThan(storage, Date.now() + 10);
			}
		}
		return null;
	}

	let connectProcessed = false;
	for (const event of batch) {
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

	// More events still queued — arm a near-term alarm to continue draining.
	if (rest.length > 0) {
		await armAlarmNoLaterThan(storage, Date.now() + 50);
	}

	return userWorker;
}

/**
 * TestDevice — a subclass of BaseDevice that exposes test-only helpers.
 *
 * These methods bypass internal guards (e.g. the __internal: key prefix) so
 * integration tests can seed and inspect internal state without going through
 * the full device-connect flow. They are NOT part of the production API surface
 * and must never be exported as the primary `Device` binding.
 *
 * Usage: bind TEST_DEVICE → TestDevice in the miniflare/vitest config.
 */

import type { CronStorage } from "./cronDispatch";
import { BaseDevice, CRON_STORAGE_KEY } from "./device";
import type { IUserDeviceWorker } from "./userWorkerTypes";

export class TestDevice extends BaseDevice {
	/**
	 * Returns the scheduled DO alarm timestamp (ms), or null if none is set.
	 */
	async getScheduledAlarmTime(): Promise<number | null> {
		return this.ctx.storage.getAlarm();
	}

	/**
	 * Triggers the DO alarm handler directly.
	 * `alarm` is a reserved DO lifecycle method and cannot be called over JSRPC;
	 * this wrapper delegates to it so tests can invoke the alarm path.
	 */
	async triggerAlarm(): Promise<void> {
		await this.alarm();
	}

	/**
	 * Seeds the internal cron storage directly, bypassing the KV guard.
	 * Pass null to clear the schedule.
	 */
	async seedCronStorage(storage: CronStorage | null): Promise<void> {
		if (storage === null) {
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
		} else {
			await this.ctx.storage.put(CRON_STORAGE_KEY, storage);
		}
	}

	/**
	 * testKvPut: wraps kvPut and returns the error message instead of throwing.
	 *
	 * When a DO method throws synchronously, the workerd I/O framework logs an
	 * "uncaught exception" before the rejection propagates to the test. This breaks
	 * vitest-pool-workers' isolated storage cleanup. Returning the error as a value
	 * avoids the workerd-level exception while still letting tests verify the guard.
	 */
	async testKvPut<T>(key: string, value: T): Promise<string | null> {
		try {
			await this.kvPut(key, value);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	/**
	 * testKvGet: wraps kvGet and returns the error message instead of throwing.
	 * See testKvPut for the rationale.
	 */
	async testKvGet<T = unknown>(
		key: string,
	): Promise<{ value: T | undefined; error: string | null }> {
		try {
			const value = await this.kvGet<T>(key);
			return { value, error: null };
		} catch (e) {
			return { value: undefined, error: (e as Error).message };
		}
	}

	/**
	 * Calls initializeCrons with a minimal mock worker that returns the given crons map.
	 * Allows integration tests to exercise the initialize path without a real LOADER binding.
	 */
	async testInitializeCrons(crons: Record<string, string>): Promise<void> {
		const mockWorker: IUserDeviceWorker = {
			onDeviceConnect: async () => {},
			onDeviceDisconnect: async () => {},
			onMessage: async () => {},
			getCrons: async () => crons,
		};
		await this.initializeCrons(mockWorker);
	}
}

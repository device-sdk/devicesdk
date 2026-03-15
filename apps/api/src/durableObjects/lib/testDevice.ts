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

import { BaseDevice, CRON_STORAGE_KEY } from "./device";
import type { CronStorage } from "./cronDispatch";
import type { IUserDeviceWorker } from "./userWorkerTypes";

export class TestDevice extends BaseDevice {
	/**
	 * Returns the scheduled DO alarm timestamp (ms), or null if none is set.
	 */
	async getScheduledAlarmTime(): Promise<number | null> {
		return this.ctx.storage.getAlarm();
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

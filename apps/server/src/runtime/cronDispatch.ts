/**
 * Pure helper functions for cron schedule dispatch logic.
 *
 * These functions contain no I/O and no side effects - they are purely
 * computational so they can be unit-tested without a Durable Object context
 * or a LOADER binding.
 *
 * The `alarm()` method in `device.ts` calls `resolveDueCrons()` to determine
 * which crons are due and what the updated schedule looks like, then handles
 * the I/O parts (reading/writing storage, calling `onCron` on the user worker).
 */

export interface CronScheduleEntry {
	cron: string;
	nextFireAt: number;
}

export type CronStorage = Record<string, CronScheduleEntry>;

export interface CronDispatchResult {
	/** Names of crons that are due to fire (nextFireAt <= now). */
	due: string[];
	/** Updated schedule with advanced nextFireAt values for all due crons. */
	updated: CronStorage;
}

/**
 * Given the stored cron schedule, the user script's current cron definitions,
 * and the current time, returns which crons are due and what the updated
 * schedule looks like after advancing them.
 *
 * - Entries removed from `currentCrons` are dropped from the schedule.
 * - Entries added or whose expression changed are reset to the next occurrence.
 * - Entries that are unchanged and not yet due are left as-is.
 * - Due entries are included in `due` and their `nextFireAt` is advanced.
 *
 * @param stored       Previously persisted cron schedule.
 * @param currentCrons Current cron definitions from the user script.
 * @param now          Current timestamp in milliseconds.
 * @param computeNext  Function that returns the next fire time for a cron
 *                     expression after `now`. Defaults to the real parser;
 *                     injectable for tests.
 * @returns            `{ due, updated }` where `due` is the list of cron names
 *                     to fire and `updated` is the persisted schedule after
 *                     advancing them.
 */
export function resolveDueCrons(
	stored: CronStorage,
	currentCrons: Record<string, string>,
	now: number,
	computeNext: (expr: string, after: number) => number,
): CronDispatchResult {
	// Start with a shallow copy of the stored schedule so we can mutate freely.
	const schedule: CronStorage = { ...stored };

	// Remove crons that no longer exist in the user script.
	for (const name of Object.keys(schedule)) {
		if (!(name in currentCrons)) {
			delete schedule[name];
		}
	}

	// Add new crons or update entries whose expression changed.
	for (const [name, expr] of Object.entries(currentCrons)) {
		if (!(name in schedule) || schedule[name].cron !== expr) {
			schedule[name] = { cron: expr, nextFireAt: computeNext(expr, now) };
		}
	}

	// Collect due entries and advance their next fire time.
	const due: string[] = [];
	for (const [name, entry] of Object.entries(schedule)) {
		if (entry.nextFireAt <= now) {
			due.push(name);
			schedule[name] = {
				...entry,
				nextFireAt: computeNext(entry.cron, now),
			};
		}
	}

	return { due, updated: schedule };
}

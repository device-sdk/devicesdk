/**
 * Unit tests for resolveDueCrons() in cronDispatch.ts.
 *
 * These tests cover the core cron dispatch logic:
 *   - Which crons are identified as due (nextFireAt <= now)
 *   - How due crons have their nextFireAt advanced
 *   - How the stored schedule is synced with the user script's current cron
 *     definitions (additions, removals, expression changes)
 *
 * No Durable Object context or LOADER binding is required — resolveDueCrons is
 * a pure function that can be tested with simple in-process mocks.
 */

import { describe, expect, it } from "vitest";
import {
	resolveDueCrons,
	type CronStorage,
} from "../../src/durableObjects/lib/cronDispatch";

// A simple stub for computeNext that returns `after + interval`.
// Makes test expectations deterministic without depending on real cron parsing.
const INTERVAL = 60_000; // 1 minute
const stubComputeNext = (_expr: string, after: number) => after + INTERVAL;

const NOW = new Date("2025-01-15T10:30:00Z").getTime();

describe("resolveDueCrons — due detection", () => {
	it("returns empty due list when no cron is past its nextFireAt", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW + 1000 },
		};
		const { due } = resolveDueCrons(stored, { heartbeat: "*/5 * * * *" }, NOW, stubComputeNext);
		expect(due).toEqual([]);
	});

	it("includes a cron whose nextFireAt equals now (boundary — inclusive)", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW },
		};
		const { due } = resolveDueCrons(stored, { heartbeat: "*/5 * * * *" }, NOW, stubComputeNext);
		expect(due).toContain("heartbeat");
	});

	it("includes a cron whose nextFireAt is before now", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW - 1 },
		};
		const { due } = resolveDueCrons(stored, { heartbeat: "*/5 * * * *" }, NOW, stubComputeNext);
		expect(due).toContain("heartbeat");
	});

	it("returns multiple due crons when several are past their nextFireAt", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW - 100 },
			report:    { cron: "0 8 * * *",   nextFireAt: NOW - 200 },
		};
		const { due } = resolveDueCrons(
			stored,
			{ heartbeat: "*/5 * * * *", report: "0 8 * * *" },
			NOW,
			stubComputeNext,
		);
		expect(due).toHaveLength(2);
		expect(due).toContain("heartbeat");
		expect(due).toContain("report");
	});

	it("only returns due crons, leaving non-due ones absent from due list", () => {
		const stored: CronStorage = {
			due:    { cron: "*/5 * * * *", nextFireAt: NOW - 1 },
			notDue: { cron: "0 8 * * *",   nextFireAt: NOW + 10_000 },
		};
		const { due } = resolveDueCrons(
			stored,
			{ due: "*/5 * * * *", notDue: "0 8 * * *" },
			NOW,
			stubComputeNext,
		);
		expect(due).toEqual(["due"]);
	});
});

describe("resolveDueCrons — schedule advancement", () => {
	it("advances nextFireAt for a due cron using computeNext", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW - 1 },
		};
		const { updated } = resolveDueCrons(
			stored,
			{ heartbeat: "*/5 * * * *" },
			NOW,
			stubComputeNext,
		);
		// stubComputeNext returns after + INTERVAL
		expect(updated.heartbeat.nextFireAt).toBe(NOW + INTERVAL);
	});

	it("does not change nextFireAt for a non-due cron", () => {
		const originalFireAt = NOW + 50_000;
		const stored: CronStorage = {
			daily: { cron: "0 8 * * *", nextFireAt: originalFireAt },
		};
		const { updated } = resolveDueCrons(
			stored,
			{ daily: "0 8 * * *" },
			NOW,
			stubComputeNext,
		);
		expect(updated.daily.nextFireAt).toBe(originalFireAt);
	});
});

describe("resolveDueCrons — schedule sync", () => {
	it("removes a cron that no longer exists in currentCrons", () => {
		const stored: CronStorage = {
			old: { cron: "*/5 * * * *", nextFireAt: NOW + 1000 },
		};
		const { updated } = resolveDueCrons(stored, {}, NOW, stubComputeNext);
		expect(updated).not.toHaveProperty("old");
	});

	it("adds a new cron that was not in the stored schedule", () => {
		const stored: CronStorage = {};
		const { updated } = resolveDueCrons(
			stored,
			{ heartbeat: "*/5 * * * *" },
			NOW,
			stubComputeNext,
		);
		expect(updated).toHaveProperty("heartbeat");
		expect(updated.heartbeat.cron).toBe("*/5 * * * *");
	});

	it("resets nextFireAt when a cron expression changes", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW + 999_999 },
		};
		const { updated } = resolveDueCrons(
			stored,
			{ heartbeat: "*/10 * * * *" }, // expression changed
			NOW,
			stubComputeNext,
		);
		// Expression changed → nextFireAt recomputed from now
		expect(updated.heartbeat.cron).toBe("*/10 * * * *");
		expect(updated.heartbeat.nextFireAt).toBe(NOW + INTERVAL);
	});

	it("preserves nextFireAt when cron expression is unchanged", () => {
		const originalFireAt = NOW + 270_000;
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: originalFireAt },
		};
		const { updated } = resolveDueCrons(
			stored,
			{ heartbeat: "*/5 * * * *" }, // expression unchanged
			NOW,
			stubComputeNext,
		);
		expect(updated.heartbeat.nextFireAt).toBe(originalFireAt);
	});

	it("handles empty stored schedule with new cron definitions", () => {
		const { due, updated } = resolveDueCrons(
			{},
			{ heartbeat: "*/5 * * * *", report: "0 8 * * *" },
			NOW,
			stubComputeNext,
		);
		expect(due).toHaveLength(0); // freshly added, scheduled for future
		expect(Object.keys(updated)).toHaveLength(2);
	});

	it("handles empty currentCrons (all crons removed)", () => {
		const stored: CronStorage = {
			heartbeat: { cron: "*/5 * * * *", nextFireAt: NOW - 1 },
			report:    { cron: "0 8 * * *",   nextFireAt: NOW - 1 },
		};
		const { due, updated } = resolveDueCrons(stored, {}, NOW, stubComputeNext);
		expect(due).toHaveLength(0);
		expect(Object.keys(updated)).toHaveLength(0);
	});
});

describe("resolveDueCrons — combined scenarios", () => {
	it("fires due cron, preserves future cron, drops removed cron, adds new cron", () => {
		const stored: CronStorage = {
			due:     { cron: "*/5 * * * *", nextFireAt: NOW - 100 },
			future:  { cron: "0 8 * * *",   nextFireAt: NOW + 3600_000 },
			removed: { cron: "1 1 * * *",   nextFireAt: NOW + 1000 },
		};
		const currentCrons = {
			due:     "*/5 * * * *",
			future:  "0 8 * * *",
			newCron: "30 12 * * *",
		};
		const { due, updated } = resolveDueCrons(stored, currentCrons, NOW, stubComputeNext);

		expect(due).toEqual(["due"]);
		expect(updated.due.nextFireAt).toBe(NOW + INTERVAL); // advanced
		expect(updated.future.nextFireAt).toBe(NOW + 3600_000); // unchanged
		expect(updated).toHaveProperty("newCron"); // added
		expect(updated).not.toHaveProperty("removed"); // dropped
	});
});

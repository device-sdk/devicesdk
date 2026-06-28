import { describe, expect, test } from "bun:test";
import {
	type CronStorage,
	resolveDueCrons,
} from "../../src/runtime/cronDispatch";
import { nextCronTime } from "../../src/runtime/cronParser";

/** UTC epoch ms for a Date.UTC tuple - keeps the cron assertions readable. */
function utc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
	return Date.UTC(y, mo - 1, d, h, mi, s);
}

describe("nextCronTime - standard expressions", () => {
	test("every minute advances to the next minute boundary", () => {
		const after = utc(2026, 6, 12, 10, 30, 15);
		const next = nextCronTime("* * * * *", after);
		expect(next).toBe(utc(2026, 6, 12, 10, 31, 0));
	});

	test("on an exact minute boundary, fires the NEXT minute (strictly after)", () => {
		const after = utc(2026, 6, 12, 10, 30, 0);
		const next = nextCronTime("* * * * *", after);
		expect(next).toBe(utc(2026, 6, 12, 10, 31, 0));
	});

	test("daily at midnight rolls to the next day", () => {
		const after = utc(2026, 6, 12, 10, 30, 0);
		const next = nextCronTime("0 0 * * *", after);
		expect(next).toBe(utc(2026, 6, 13, 0, 0, 0));
	});

	test("*/15 minutes picks the next quarter-hour", () => {
		const after = utc(2026, 6, 12, 10, 7, 0);
		expect(nextCronTime("*/15 * * * *", after)).toBe(
			utc(2026, 6, 12, 10, 15, 0),
		);
		const after2 = utc(2026, 6, 12, 10, 46, 0);
		expect(nextCronTime("*/15 * * * *", after2)).toBe(
			utc(2026, 6, 12, 11, 0, 0),
		);
	});

	test("day-of-week (Mondays at 09:00)", () => {
		// 2026-06-12 is a Friday; the next Monday is 2026-06-15.
		const after = utc(2026, 6, 12, 12, 0, 0);
		const next = nextCronTime("0 9 * * 1", after);
		expect(next).toBe(utc(2026, 6, 15, 9, 0, 0));
		expect(new Date(next).getUTCDay()).toBe(1);
	});

	test("dow 0 and 7 both mean Sunday", () => {
		const after = utc(2026, 6, 12, 0, 0, 0); // Friday
		const sun0 = nextCronTime("0 0 * * 0", after);
		const sun7 = nextCronTime("0 0 * * 7", after);
		expect(sun0).toBe(sun7);
		expect(new Date(sun0).getUTCDay()).toBe(0);
	});

	test("hour range (9-17) only fires within business hours", () => {
		// At 18:30 the next in-range slot is 09:00 the following day.
		const after = utc(2026, 6, 12, 18, 30, 0);
		const next = nextCronTime("0 9-17 * * *", after);
		expect(next).toBe(utc(2026, 6, 13, 9, 0, 0));
	});

	test("minute list (0,30) fires twice an hour", () => {
		const after = utc(2026, 6, 12, 10, 5, 0);
		expect(nextCronTime("0,30 * * * *", after)).toBe(
			utc(2026, 6, 12, 10, 30, 0),
		);
		const after2 = utc(2026, 6, 12, 10, 30, 0);
		expect(nextCronTime("0,30 * * * *", after2)).toBe(
			utc(2026, 6, 12, 11, 0, 0),
		);
	});

	test("step within a range (0-30/10 minutes)", () => {
		const after = utc(2026, 6, 12, 10, 5, 0);
		// valid minutes: 0,10,20,30 → next after :05 is :10
		expect(nextCronTime("0-30/10 * * * *", after)).toBe(
			utc(2026, 6, 12, 10, 10, 0),
		);
	});

	test("specific date/time (Jan 1 00:00)", () => {
		const after = utc(2026, 12, 30, 0, 0, 0);
		const next = nextCronTime("0 0 1 1 *", after);
		expect(next).toBe(utc(2027, 1, 1, 0, 0, 0));
	});

	test("dow range 0-7 is accepted (7 normalizes to Sunday)", () => {
		// 2026-06-12 is a Friday; any-day every-minute within a 0-7 dow range fires.
		expect(() =>
			nextCronTime("0 0 * * 0-7", utc(2026, 6, 12, 0, 0, 0)),
		).not.toThrow();
	});
});

describe("nextCronTime - edge rollovers", () => {
	test("end-of-month rollover to next month", () => {
		// every minute, last minute of June → first minute of next slot crosses
		// into July 1.
		const after = utc(2026, 6, 30, 23, 59, 0);
		const next = nextCronTime("* * * * *", after);
		expect(next).toBe(utc(2026, 7, 1, 0, 0, 0));
	});

	test("end-of-year rollover", () => {
		const after = utc(2026, 12, 31, 23, 59, 0);
		const next = nextCronTime("* * * * *", after);
		expect(next).toBe(utc(2027, 1, 1, 0, 0, 0));
	});

	test("Feb 29 only matches on leap years", () => {
		// From within a year of the leap day, the parser finds 2028-02-29.
		const after = utc(2028, 1, 1, 0, 0, 0);
		const next = nextCronTime("0 0 29 2 *", after);
		expect(next).toBe(utc(2028, 2, 29, 0, 0, 0));
	});

	test("the one-year search bound is real: a >1yr-away match throws", () => {
		// 2027 is not a leap year and the next Feb 29 (2028) is more than one
		// year past 2027-01-01, so the parser gives up. Documents the bound.
		expect(() =>
			nextCronTime("0 0 29 2 *", utc(2027, 1, 1, 0, 0, 0)),
		).toThrow();
	});
});

describe("nextCronTime - invalid expressions throw", () => {
	test("wrong field count", () => {
		expect(() => nextCronTime("* * * *", 0)).toThrow();
		expect(() => nextCronTime("* * * * * *", 0)).toThrow();
	});

	test("non-numeric value", () => {
		expect(() => nextCronTime("abc * * * *", 0)).toThrow();
	});

	test("out-of-range value", () => {
		expect(() => nextCronTime("99 * * * *", 0)).toThrow();
	});

	test("zero or negative step", () => {
		expect(() => nextCronTime("*/0 * * * *", 0)).toThrow();
	});

	test("impossible date never resolves within a year", () => {
		// Feb 30 doesn't exist.
		expect(() => nextCronTime("0 0 30 2 *", 0)).toThrow();
	});

	test("range with an out-of-range upper bound throws (no unbounded loop)", () => {
		expect(() => nextCronTime("1-999999999 * * * *", 0)).toThrow();
	});

	test("step over an out-of-range range throws", () => {
		expect(() => nextCronTime("1-999999999/2 * * * *", 0)).toThrow();
	});

	test("range below the field minimum throws", () => {
		// hours are [0,23]; an upper bound of 999 is rejected
		expect(() => nextCronTime("0 0-999 * * *", 0)).toThrow();
	});
});

describe("resolveDueCrons", () => {
	// Deterministic stub: every cron fires exactly 60s after `now`.
	const computeNext = (_expr: string, after: number) => after + 60_000;

	test("new crons are scheduled (not immediately due)", () => {
		const now = 1_000_000;
		const { due, updated } = resolveDueCrons(
			{},
			{ tick: "* * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual([]);
		expect(updated.tick.cron).toBe("* * * * *");
		expect(updated.tick.nextFireAt).toBe(now + 60_000);
	});

	test("a due cron is returned and its nextFireAt advances", () => {
		const now = 1_000_000;
		const stored: CronStorage = {
			tick: { cron: "* * * * *", nextFireAt: now - 5_000 },
		};
		const { due, updated } = resolveDueCrons(
			stored,
			{ tick: "* * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual(["tick"]);
		expect(updated.tick.nextFireAt).toBe(now + 60_000);
	});

	test("nextFireAt exactly == now is due (<=)", () => {
		const now = 1_000_000;
		const stored: CronStorage = {
			tick: { cron: "* * * * *", nextFireAt: now },
		};
		const { due } = resolveDueCrons(
			stored,
			{ tick: "* * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual(["tick"]);
	});

	test("removed crons are dropped from the schedule", () => {
		const now = 1_000_000;
		const stored: CronStorage = {
			gone: { cron: "* * * * *", nextFireAt: now + 30_000 },
			kept: { cron: "0 * * * *", nextFireAt: now + 30_000 },
		};
		const { due, updated } = resolveDueCrons(
			stored,
			{ kept: "0 * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual([]);
		expect(updated.gone).toBeUndefined();
		expect(updated.kept).toBeDefined();
		// Unchanged + not due → left as-is.
		expect(updated.kept.nextFireAt).toBe(now + 30_000);
	});

	test("changed expression resets the schedule entry", () => {
		const now = 1_000_000;
		const stored: CronStorage = {
			tick: { cron: "* * * * *", nextFireAt: now + 30_000 },
		};
		const { updated } = resolveDueCrons(
			stored,
			{ tick: "0 0 * * *" },
			now,
			computeNext,
		);
		expect(updated.tick.cron).toBe("0 0 * * *");
		expect(updated.tick.nextFireAt).toBe(now + 60_000);
	});

	test("missed slots are skipped, not caught up (advance once to a future slot)", () => {
		const now = 1_000_000;
		// nextFireAt is way in the past - many slots were missed while offline.
		const stored: CronStorage = {
			tick: { cron: "* * * * *", nextFireAt: now - 10 * 60_000 },
		};
		// computeNext returns a single future time; resolveDueCrons must fire
		// once and jump straight to that future slot (no backlog catch-up).
		const { due, updated } = resolveDueCrons(
			stored,
			{ tick: "* * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual(["tick"]);
		expect(updated.tick.nextFireAt).toBe(now + 60_000);
		expect(updated.tick.nextFireAt).toBeGreaterThan(now);
	});

	test("multiple crons resolve independently", () => {
		const now = 1_000_000;
		const stored: CronStorage = {
			a: { cron: "* * * * *", nextFireAt: now - 1 },
			b: { cron: "* * * * *", nextFireAt: now + 99_999 },
		};
		const { due, updated } = resolveDueCrons(
			stored,
			{ a: "* * * * *", b: "* * * * *" },
			now,
			computeNext,
		);
		expect(due).toEqual(["a"]);
		expect(updated.a.nextFireAt).toBe(now + 60_000);
		expect(updated.b.nextFireAt).toBe(now + 99_999); // untouched
	});

	test("default computeNext (real parser) integrates with the dispatcher", () => {
		const now = utc(2026, 6, 12, 10, 0, 0);
		const stored: CronStorage = {
			tick: { cron: "*/15 * * * *", nextFireAt: now - 1 },
		};
		// Use the real nextCronTime as the injected default.
		const { due, updated } = resolveDueCrons(
			stored,
			{ tick: "*/15 * * * *" },
			now,
			nextCronTime,
		);
		expect(due).toEqual(["tick"]);
		expect(updated.tick.nextFireAt).toBe(utc(2026, 6, 12, 10, 15, 0));
	});
});

import { describe, expect, it } from "vitest";
import { nextCronTime } from "../../src/durableObjects/lib/cronParser";

// Fixed reference timestamp: 2025-01-15 10:30:00 UTC (Wednesday)
// epoch: 1736937000000
const BASE = new Date("2025-01-15T10:30:00Z").getTime();

describe("cronParser — nextCronTime", () => {
	describe("wildcard (*) fields", () => {
		it("fires every minute for * * * * *", () => {
			const next = nextCronTime("* * * * *", BASE);
			// Next minute boundary is 10:31:00
			expect(next).toBe(new Date("2025-01-15T10:31:00Z").getTime());
		});

		it("always advances by at least one minute", () => {
			// Even if `after` is exactly on a minute boundary, the result must be strictly after it
			const onMinute = new Date("2025-01-15T10:30:00Z").getTime();
			const next = nextCronTime("* * * * *", onMinute);
			expect(next).toBeGreaterThan(onMinute);
		});
	});

	describe("specific values", () => {
		it("fires at a specific minute within the current hour", () => {
			// after 10:30 → next 45th minute in same hour
			const next = nextCronTime("45 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T10:45:00Z").getTime());
		});

		it("wraps to the next hour when the minute has passed", () => {
			// after 10:30 → minute 15 already past → next is 11:15
			const next = nextCronTime("15 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:15:00Z").getTime());
		});

		it("fires at a specific hour", () => {
			// after 10:30 → next occurrence of hour=14, minute=0
			const next = nextCronTime("0 14 * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T14:00:00Z").getTime());
		});

		it("wraps to the next day when the hour has passed", () => {
			// after 10:30 → hour=8 already past today → tomorrow 08:00
			const next = nextCronTime("0 8 * * *", BASE);
			expect(next).toBe(new Date("2025-01-16T08:00:00Z").getTime());
		});

		it("fires at a specific day of month", () => {
			// after 2025-01-15 10:30 → next 20th at 00:00
			const next = nextCronTime("0 0 20 * *", BASE);
			expect(next).toBe(new Date("2025-01-20T00:00:00Z").getTime());
		});

		it("wraps to the next month when day has passed", () => {
			// after 2025-01-15 → day=5 has passed → next Feb 5
			const next = nextCronTime("0 0 5 * *", BASE);
			expect(next).toBe(new Date("2025-02-05T00:00:00Z").getTime());
		});

		it("fires at a specific month", () => {
			// after 2025-01-15 → month=3 (March) → 2025-03-01 00:00
			const next = nextCronTime("0 0 1 3 *", BASE);
			expect(next).toBe(new Date("2025-03-01T00:00:00Z").getTime());
		});

		it("wraps to the next year when month has passed", () => {
			// after 2025-01-15 → same month (1) but day=10 has passed → 2026-01-10
			const next = nextCronTime("0 0 10 1 *", BASE);
			expect(next).toBe(new Date("2026-01-10T00:00:00Z").getTime());
		});
	});

	describe("step syntax (*/N)", () => {
		it("fires every 5 minutes", () => {
			// after 10:30 → next multiple-of-5 minute is 10:35
			const next = nextCronTime("*/5 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T10:35:00Z").getTime());
		});

		it("fires every 15 minutes", () => {
			const next = nextCronTime("*/15 * * * *", BASE);
			// 10:30 → next is 10:45
			expect(next).toBe(new Date("2025-01-15T10:45:00Z").getTime());
		});

		it("fires every 6 hours", () => {
			// after 10:30 → every 6h starting from 0: 0,6,12,18 → next is 12:00
			const next = nextCronTime("0 */6 * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T12:00:00Z").getTime());
		});

		it("fires every 2 days", () => {
			// after Jan 15 → day 1,3,5,7... → next is Jan 17
			const next = nextCronTime("0 0 */2 * *", BASE);
			expect(next).toBe(new Date("2025-01-17T00:00:00Z").getTime());
		});
	});

	describe("range syntax (N-M)", () => {
		it("fires on any minute in the range", () => {
			// after 10:30 → next is 10:31 (31 is in range 30-45)
			const next = nextCronTime("30-45 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T10:31:00Z").getTime());
		});

		it("wraps when minute range is fully past in the current hour", () => {
			// after 10:30 → range 0-20 is past for this hour → next is 11:00
			const next = nextCronTime("0-20 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:00:00Z").getTime());
		});

		it("fires on any hour in the range", () => {
			// after 10:30 → range 8-12, next valid hour is 11:00
			const next = nextCronTime("0 8-12 * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:00:00Z").getTime());
		});
	});

	describe("comma-separated values", () => {
		it("fires at the next minute in the list", () => {
			// after 10:30 → list has 15,30,45 → next is 10:45
			const next = nextCronTime("15,30,45 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T10:45:00Z").getTime());
		});

		it("wraps to next hour when all values in list have passed", () => {
			// after 10:30 → list has 10,20 → both passed → next is 11:10
			const next = nextCronTime("10,20 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:10:00Z").getTime());
		});

		it("fires on any matching day of week", () => {
			// after 2025-01-15 (Wednesday=3) → DOW 1,5 (Mon,Fri) → next is Friday Jan 17
			const next = nextCronTime("0 0 * * 1,5", BASE);
			expect(next).toBe(new Date("2025-01-17T00:00:00Z").getTime());
		});
	});

	describe("range with step (N-M/S)", () => {
		it("fires at step intervals within the range", () => {
			// minutes: 0-30/10 → 0,10,20,30 → after 10:30 → 10:30 is boundary, next is 11:00
			const next = nextCronTime("0-30/10 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:00:00Z").getTime());
		});

		it("fires at step intervals starting within range", () => {
			// minutes: 5-59/10 → 5,15,25,35,45,55 → after 10:30 → next is 10:35
			const next = nextCronTime("5-59/10 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T10:35:00Z").getTime());
		});
	});

	describe("day-of-week (DOW) matching", () => {
		it("fires on a specific day of week (Friday)", () => {
			// after 2025-01-15 (Wednesday) → next Friday = Jan 17
			const next = nextCronTime("0 0 * * 5", BASE);
			expect(next).toBe(new Date("2025-01-17T00:00:00Z").getTime());
		});

		it("normalises DOW value 7 to Sunday (0)", () => {
			// DOW=7 means Sunday; after 2025-01-15 (Wednesday) → next Sunday = Jan 19
			const next7 = nextCronTime("0 0 * * 7", BASE);
			const next0 = nextCronTime("0 0 * * 0", BASE);
			expect(next7).toBe(next0);
			expect(next7).toBe(new Date("2025-01-19T00:00:00Z").getTime());
		});

		it("fires on Monday", () => {
			// after 2025-01-15 (Wednesday) → next Monday = Jan 20
			const next = nextCronTime("0 0 * * 1", BASE);
			expect(next).toBe(new Date("2025-01-20T00:00:00Z").getTime());
		});
	});

	describe("DOM and DOW OR semantics", () => {
		it("matches when DOM matches (even if DOW does not)", () => {
			// DOM=20 is a Monday; DOW=5 is Friday; after Jan 15
			// OR semantics: fires if DOM=20 OR DOW=5
			// Next DOW=5 is Jan 17; next DOM=20 is Jan 20
			// → earliest is Jan 17 (Friday)
			const next = nextCronTime("0 0 20 * 5", BASE);
			expect(next).toBe(new Date("2025-01-17T00:00:00Z").getTime());
		});

		it("matches when DOW matches (even if DOM does not)", () => {
			// DOM=31, DOW=3 (Wednesday); after Jan 15 (Wednesday)
			// OR semantics: fires if DOM=31 OR DOW=3
			// Next Wednesday is Jan 22
			// Jan 31 is also valid
			// Earliest is Jan 22
			const next = nextCronTime("0 0 31 * 3", BASE);
			expect(next).toBe(new Date("2025-01-22T00:00:00Z").getTime());
		});

		it("uses AND-only when only DOM is restricted", () => {
			// DOM=20, DOW=* → only DOM matters → Jan 20
			const next = nextCronTime("0 0 20 * *", BASE);
			expect(next).toBe(new Date("2025-01-20T00:00:00Z").getTime());
		});

		it("uses AND-only when only DOW is restricted", () => {
			// DOM=*, DOW=5 (Friday) → only DOW matters → Jan 17
			const next = nextCronTime("0 0 * * 5", BASE);
			expect(next).toBe(new Date("2025-01-17T00:00:00Z").getTime());
		});
	});

	describe("common real-world schedules", () => {
		it("daily at midnight", () => {
			const next = nextCronTime("0 0 * * *", BASE);
			expect(next).toBe(new Date("2025-01-16T00:00:00Z").getTime());
		});

		it("weekly on Sunday at noon", () => {
			// after 2025-01-15 (Wednesday) → next Sunday Jan 19
			const next = nextCronTime("0 12 * * 0", BASE);
			expect(next).toBe(new Date("2025-01-19T12:00:00Z").getTime());
		});

		it("first day of each month", () => {
			// after Jan 15 → next Feb 1
			const next = nextCronTime("0 0 1 * *", BASE);
			expect(next).toBe(new Date("2025-02-01T00:00:00Z").getTime());
		});

		it("every 30 minutes", () => {
			// after 10:30 → 11:00
			const next = nextCronTime("0,30 * * * *", BASE);
			expect(next).toBe(new Date("2025-01-15T11:00:00Z").getTime());
		});
	});

	describe("error handling", () => {
		it("throws for wrong field count", () => {
			expect(() => nextCronTime("* * * *", BASE)).toThrow(
				"Cron expression must have 5 fields",
			);
			expect(() => nextCronTime("* * * * * *", BASE)).toThrow(
				"Cron expression must have 5 fields",
			);
		});

		it("throws for out-of-range minute", () => {
			expect(() => nextCronTime("60 * * * *", BASE)).toThrow();
		});

		it("throws for out-of-range hour", () => {
			expect(() => nextCronTime("0 24 * * *", BASE)).toThrow();
		});

		it("throws for invalid step value", () => {
			expect(() => nextCronTime("*/0 * * * *", BASE)).toThrow();
		});

		it("throws for non-numeric value", () => {
			expect(() => nextCronTime("abc * * * *", BASE)).toThrow();
		});

		it("throws when no match found within one year", () => {
			// Feb 30 never exists — scheduler will scan the whole year and give up
			expect(() => nextCronTime("0 0 30 2 *", BASE)).toThrow(
				"No valid fire time found within 1 year",
			);
		});
	});

	describe("edge cases", () => {
		it("handles leading/trailing whitespace in expression", () => {
			const next = nextCronTime("  */5 * * * *  ", BASE);
			expect(next).toBe(new Date("2025-01-15T10:35:00Z").getTime());
		});

		it("correctly advances to 10:35 just before the minute boundary", () => {
			// 10:34:59.999 → next */5 minute is 10:35:00
			const justBefore = new Date("2025-01-15T10:35:00Z").getTime() - 1;
			const next = nextCronTime("*/5 * * * *", justBefore);
			expect(next).toBe(new Date("2025-01-15T10:35:00Z").getTime());
		});

		it("correctly advances to 10:40 when at exactly 10:35", () => {
			// exactly on the 10:35 boundary → next fires at 10:40
			const onBoundary = new Date("2025-01-15T10:35:00Z").getTime();
			const next = nextCronTime("*/5 * * * *", onBoundary);
			expect(next).toBe(new Date("2025-01-15T10:40:00Z").getTime());
		});

		it("handles month boundary correctly (Jan→Feb)", () => {
			// after Jan 31 23:59 → next day 1 of any month is Feb 1
			const endOfJan = new Date("2025-01-31T23:59:00Z").getTime();
			const next = nextCronTime("0 0 1 * *", endOfJan);
			expect(next).toBe(new Date("2025-02-01T00:00:00Z").getTime());
		});

		it("handles year boundary correctly (Dec→Jan)", () => {
			// after Dec 31 → next occurrence is Jan 15 next year
			const endOfYear = new Date("2025-12-31T23:59:00Z").getTime();
			const next = nextCronTime("0 0 15 * *", endOfYear);
			expect(next).toBe(new Date("2026-01-15T00:00:00Z").getTime());
		});

		it("February short month: day 28 fires in Feb", () => {
			// after 2025-01-15 → next Feb 28 (2025 is not a leap year)
			const next = nextCronTime("0 0 28 2 *", BASE);
			expect(next).toBe(new Date("2025-02-28T00:00:00Z").getTime());
		});
	});
});

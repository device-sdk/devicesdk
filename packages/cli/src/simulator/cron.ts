/**
 * Minimal 5-field cron matcher for the local dev simulator (`devicesdk dev`).
 *
 * Replicates the semantics of the server's scheduler
 * (apps/server/src/runtime/cronParser.ts):
 * - 5 UTC fields: minute hour dom month dow (0-6, 0 = Sunday; 7 also Sunday)
 * - Field syntax: `*`, `N`, `N-M`, star-slash-N, `N-M/S`, comma-separated lists
 * - OR semantics when both dom and dow are restricted (standard cron)
 * - Missed slots are skipped, never caught up: the 1s tick only fires for the
 *   minute that is currently matching, so minutes that elapsed while the
 *   simulated device was offline never fire.
 *
 * Unlike the server this is a matcher (does `expr` fire this minute?), not a
 * next-fire-time calculator - good enough for the simulator's tick loop.
 */

export interface CronSchedule {
	minutes: Set<number>;
	hours: Set<number>;
	daysOfMonth: Set<number>;
	months: Set<number>;
	daysOfWeek: Set<number>;
	domRestricted: boolean;
	dowRestricted: boolean;
}

function parseCronField(
	field: string,
	min: number,
	max: number,
): number[] | null {
	if (field === "*") {
		return Array.from({ length: max - min + 1 }, (_, i) => i + min);
	}

	const values = new Set<number>();

	for (const part of field.split(",")) {
		// An empty list entry ("5,,6") would otherwise parse as 0 via
		// Number("") - reject it like the server's parseInt-based parser.
		if (part === "") return null;
		if (part.includes("/")) {
			const [rangePart, stepStr] = part.split("/");
			// Empty segments would coerce to 0 via Number("") - reject them
			// like the server's parseInt-based parser.
			if (rangePart === "" || stepStr === "") return null;
			const step = Number(stepStr);
			if (!Number.isInteger(step) || step <= 0) return null;
			let start = min;
			let end = max;
			if (rangePart !== "*") {
				const dashIdx = rangePart.indexOf("-");
				if (dashIdx !== -1) {
					start = Number(rangePart.slice(0, dashIdx));
					end = Number(rangePart.slice(dashIdx + 1));
				} else {
					start = Number(rangePart);
				}
				if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
			}
			if (start < min || start > max || end < min || end > max) return null;
			if (start > end) return null;
			for (let i = start; i <= end; i += step) values.add(i);
		} else if (part.includes("-")) {
			const dashIdx = part.indexOf("-");
			if (part.slice(0, dashIdx) === "" || part.slice(dashIdx + 1) === "")
				return null;
			const start = Number(part.slice(0, dashIdx));
			const end = Number(part.slice(dashIdx + 1));
			if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
			if (start < min || start > max || end < min || end > max) return null;
			if (start > end) return null;
			for (let i = start; i <= end; i++) values.add(i);
		} else {
			const n = Number(part);
			if (!Number.isInteger(n) || n < min || n > max) return null;
			values.add(n);
		}
	}

	const result = [...values]
		.filter((v) => v >= min && v <= max)
		.sort((a, b) => a - b);
	return result.length > 0 ? result : null;
}

export function parseCron(expr: string): CronSchedule | null {
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) return null;

	const bounds: Array<[number, number]> = [
		[0, 59],
		[0, 23],
		[1, 31],
		[1, 12],
		[0, 7],
	];
	const fields: number[][] = [];
	for (let i = 0; i < 5; i++) {
		const parsed = parseCronField(parts[i], bounds[i][0], bounds[i][1]);
		if (parsed === null) return null;
		fields.push(parsed);
	}
	const [minutes, hours, daysOfMonth, months, dows] = fields;

	return {
		minutes: new Set(minutes),
		hours: new Set(hours),
		daysOfMonth: new Set(daysOfMonth),
		months: new Set(months),
		// 7 is a synonym for 0 (Sunday), matching the server's parser.
		daysOfWeek: new Set(dows.map((d) => (d === 7 ? 0 : d))),
		domRestricted: parts[2] !== "*",
		dowRestricted: parts[4] !== "*",
	};
}

/** Returns true when `expr` fires during the UTC minute `date` is in. */
export function cronMatches(expr: string, date: Date): boolean {
	const schedule = parseCron(expr);
	if (schedule === null) return false;

	const dom = date.getUTCDate();
	const dow = date.getUTCDay();
	const domMatch = schedule.daysOfMonth.has(dom);
	const dowMatch = schedule.daysOfWeek.has(dow);
	const dayMatch =
		schedule.domRestricted && schedule.dowRestricted
			? domMatch || dowMatch
			: schedule.domRestricted
				? domMatch
				: schedule.dowRestricted
					? dowMatch
					: true;

	return (
		dayMatch &&
		schedule.months.has(date.getUTCMonth() + 1) &&
		schedule.hours.has(date.getUTCHours()) &&
		schedule.minutes.has(date.getUTCMinutes())
	);
}

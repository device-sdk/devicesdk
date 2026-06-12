/**
 * Minimal cron expression parser for scheduling device script alarms.
 *
 * Supports standard 5-field cron format:
 *   minute hour dom month dow
 *   0-59   0-23  1-31  1-12  0-6 (0=Sunday)
 *
 * Field syntax:
 *   *       - any value
 *   N       - specific value
 *   *\/N    - every N units (step from field minimum)
 *   N-M     - inclusive range
 *   N,M,... - comma-separated list
 *   N-M/S   - range with step
 */

/**
 * Parses a single cron field into the set of valid integer values.
 */
function parseCronField(field: string, min: number, max: number): number[] {
	if (field === "*") {
		return Array.from({ length: max - min + 1 }, (_, i) => i + min);
	}

	const values = new Set<number>();

	for (const part of field.split(",")) {
		if (part.includes("/")) {
			// Step syntax: */N or N-M/S
			const [rangePart, stepStr] = part.split("/");
			const step = parseInt(stepStr, 10);
			if (Number.isNaN(step) || step <= 0) {
				throw new Error(`Invalid cron step in: ${part}`);
			}
			let start = min;
			let end = max;
			if (rangePart !== "*") {
				const dashIdx = rangePart.indexOf("-");
				if (dashIdx !== -1) {
					start = parseInt(rangePart.slice(0, dashIdx), 10);
					end = parseInt(rangePart.slice(dashIdx + 1), 10);
				} else {
					start = parseInt(rangePart, 10);
				}
			}
			for (let i = start; i <= end; i += step) {
				values.add(i);
			}
		} else if (part.includes("-")) {
			// Range syntax: N-M
			const dashIdx = part.indexOf("-");
			const start = parseInt(part.slice(0, dashIdx), 10);
			const end = parseInt(part.slice(dashIdx + 1), 10);
			if (Number.isNaN(start) || Number.isNaN(end)) {
				throw new Error(`Invalid cron range: ${part}`);
			}
			for (let i = start; i <= end; i++) {
				values.add(i);
			}
		} else {
			// Single value
			const n = parseInt(part, 10);
			if (Number.isNaN(n)) {
				throw new Error(`Invalid cron value: ${part}`);
			}
			if (n < min || n > max) {
				throw new Error(
					`Value ${n} out of range [${min}, ${max}] in cron field: ${part}`,
				);
			}
			values.add(n);
		}
	}

	const result = [...values]
		.filter((v) => v >= min && v <= max)
		.sort((a, b) => a - b);
	if (result.length === 0) {
		throw new Error(
			`Cron field "${field}" produces no valid values in range [${min}, ${max}]`,
		);
	}
	return result;
}

/**
 * Returns the next UTC timestamp (ms) at which the given cron expression fires,
 * strictly after the `after` timestamp.
 *
 * Throws if no match is found within one year.
 */
export function nextCronTime(cronExpr: string, after: number): number {
	const parts = cronExpr.trim().split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(`Cron expression must have 5 fields, got: "${cronExpr}"`);
	}

	const [minuteField, hourField, domField, monthField, dowField] = parts;

	const validMinutes = parseCronField(minuteField, 0, 59);
	const validHours = parseCronField(hourField, 0, 23);
	const validDoms = parseCronField(domField, 1, 31);
	const validMonths = parseCronField(monthField, 1, 12);
	// Normalize 7 → 0 (both mean Sunday)
	const validDows = parseCronField(dowField, 0, 7)
		.map((d) => (d === 7 ? 0 : d))
		.filter((v, i, arr) => arr.indexOf(v) === i)
		.sort((a, b) => a - b);

	// Whether dom and dow fields are restricted (non-wildcard)
	const domRestricted = domField !== "*";
	const dowRestricted = dowField !== "*";

	// Start from the next minute boundary after `after`
	let cursor = new Date(Math.ceil((after + 1) / 60_000) * 60_000);
	cursor.setUTCSeconds(0, 0);

	const maxTime = after + 366 * 24 * 60 * 60 * 1_000;

	while (cursor.getTime() <= maxTime) {
		const month = cursor.getUTCMonth() + 1; // 1-12

		// Skip to next month if current month is invalid
		if (!validMonths.includes(month)) {
			cursor = new Date(
				Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
			);
			continue;
		}

		const dom = cursor.getUTCDate();
		const dow = cursor.getUTCDay(); // 0-6

		// Day matching: OR semantics when both restricted, single check otherwise
		const domMatch = validDoms.includes(dom);
		const dowMatch = validDows.includes(dow);
		const dayMatch =
			domRestricted && dowRestricted
				? domMatch || dowMatch
				: domRestricted
					? domMatch
					: dowRestricted
						? dowMatch
						: true;

		if (!dayMatch) {
			// Advance to next day
			cursor = new Date(
				Date.UTC(
					cursor.getUTCFullYear(),
					cursor.getUTCMonth(),
					cursor.getUTCDate() + 1,
				),
			);
			continue;
		}

		const hour = cursor.getUTCHours();

		// Skip to next valid hour
		if (!validHours.includes(hour)) {
			const nextHour = validHours.find((h) => h > hour);
			if (nextHour === undefined) {
				// No valid hour today; advance to next day
				cursor = new Date(
					Date.UTC(
						cursor.getUTCFullYear(),
						cursor.getUTCMonth(),
						cursor.getUTCDate() + 1,
					),
				);
			} else {
				cursor = new Date(
					Date.UTC(
						cursor.getUTCFullYear(),
						cursor.getUTCMonth(),
						cursor.getUTCDate(),
						nextHour,
					),
				);
			}
			continue;
		}

		const minute = cursor.getUTCMinutes();

		// Skip to next valid minute within this hour
		if (!validMinutes.includes(minute)) {
			const nextMinute = validMinutes.find((m) => m > minute);
			if (nextMinute === undefined) {
				// No valid minute in this hour; advance to next hour
				cursor = new Date(
					Date.UTC(
						cursor.getUTCFullYear(),
						cursor.getUTCMonth(),
						cursor.getUTCDate(),
						cursor.getUTCHours() + 1,
					),
				);
			} else {
				cursor = new Date(
					Date.UTC(
						cursor.getUTCFullYear(),
						cursor.getUTCMonth(),
						cursor.getUTCDate(),
						cursor.getUTCHours(),
						nextMinute,
					),
				);
			}
			continue;
		}

		return cursor.getTime();
	}

	throw new Error(
		`No valid fire time found within 1 year for cron: "${cronExpr}"`,
	);
}

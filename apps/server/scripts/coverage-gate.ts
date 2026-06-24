#!/usr/bin/env bun
/**
 * Runs the server test suite with coverage and enforces a project-wide minimum
 * on the "All files" totals (both function and line coverage).
 *
 * Why a script instead of bun's built-in `coverageThreshold`:
 *   - the numeric form gates EVERY file individually - the BaseRoute-pattern
 *     endpoints (inherited schema/handle members that aren't all exercised)
 *     can't reach the bar per-file even when the project total is well above it;
 *   - the `{ line, function }` table form is silently ignored on bun 1.3.14.
 * Parsing the aggregate row gives the "85% of the package" gate we actually want.
 *
 * Coverage scoping (which files count) lives in bunfig.toml's
 * coveragePathIgnorePatterns - the uploaded user-script fixtures, the published
 * @devicesdk/core bundle, and the test harness are excluded there.
 */

const MIN_PERCENT = Number(process.env.COVERAGE_MIN ?? "85");

const proc = Bun.spawnSync(
	["bun", "test", "src", "tests", "--coverage", "--coverage-reporter=text"],
	{ stdout: "pipe", stderr: "pipe" },
);

// bun prints the coverage table on stderr and test results on stdout; surface
// everything so CI logs read exactly like a normal `bun test --coverage`.
const stdout = proc.stdout.toString();
const stderr = proc.stderr.toString();
process.stdout.write(stdout);
process.stderr.write(stderr);

// A failing test run already failed - don't mask it behind a coverage check.
if (proc.exitCode !== 0) {
	console.error(
		`\n✖ Tests failed (exit ${proc.exitCode}); skipping coverage gate.`,
	);
	process.exit(proc.exitCode ?? 1);
}

const combined = `${stderr}\n${stdout}`;
// "All files                 |   88.96 |   96.20 |"  →  [funcs, lines]
const row = combined
	.split("\n")
	.find((line) => line.trimStart().startsWith("All files"));
if (!row) {
	console.error("✖ Coverage gate: could not find the 'All files' summary row.");
	process.exit(1);
}

const numbers = row.match(/\d+\.\d+|\d+/g)?.map(Number) ?? [];
const [funcs, lines] = numbers;
if (funcs === undefined || lines === undefined) {
	console.error(
		`✖ Coverage gate: could not parse percentages from: ${row.trim()}`,
	);
	process.exit(1);
}

const failures: string[] = [];
if (funcs < MIN_PERCENT) failures.push(`functions ${funcs}% < ${MIN_PERCENT}%`);
if (lines < MIN_PERCENT) failures.push(`lines ${lines}% < ${MIN_PERCENT}%`);

if (failures.length > 0) {
	console.error(
		`\n✖ Coverage gate FAILED (minimum ${MIN_PERCENT}%): ${failures.join(", ")}`,
	);
	process.exit(1);
}

console.log(
	`\n✔ Coverage gate passed: functions ${funcs}%, lines ${lines}% (minimum ${MIN_PERCENT}%).`,
);

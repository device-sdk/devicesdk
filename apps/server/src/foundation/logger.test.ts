import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetLogger, ServerLogger } from "./logger";

describe("ServerLogger", () => {
	let dataDir: string;
	let logFile: string;

	beforeAll(() => {
		dataDir = mkdtempSync(join(tmpdir(), "dsdk-logger-"));
		logFile = join(dataDir, "server.log");
	});

	afterAll(() => {
		rmSync(dataDir, { recursive: true, force: true });
		resetLogger();
	});

	beforeEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	it("writes JSON log lines to the configured file", async () => {
		const logger = new ServerLogger({ logFile, mirrorToConsole: false });
		logger.info("hello world", { requestId: "abc" });
		await logger.flush();
		await logger.close();

		const lines = readFileSync(logFile, "utf8").trim().split("\n");
		expect(lines).toHaveLength(1);
		const parsed = JSON.parse(lines[0]);
		expect(parsed.level).toBe("info");
		expect(parsed.message).toBe("hello world");
		expect(parsed.requestId).toBe("abc");
		expect(typeof parsed.time).toBe("string");
	});

	it("writes all log levels", async () => {
		const logger = new ServerLogger({ logFile, mirrorToConsole: false });
		logger.debug("debug msg");
		logger.info("info msg");
		logger.warn("warn msg");
		logger.error(new Error("boom"), "error msg");
		await logger.flush();
		await logger.close();

		const lines = readFileSync(logFile, "utf8").trim().split("\n");
		expect(lines).toHaveLength(4);
		const levels = lines.map((line) => JSON.parse(line).level);
		expect(levels).toEqual(["debug", "info", "warn", "error"]);

		const errorLine = JSON.parse(lines[3]);
		expect(errorLine.errorMessage).toBe("boom");
		expect(typeof errorLine.stack).toBe("string");
	});

	it("rotates the log file when it exceeds maxFileSize", async () => {
		const logger = new ServerLogger({
			logFile,
			mirrorToConsole: false,
			maxFileSize: 80,
			maxFiles: 2,
		});
		await logger.info("first");
		await logger.info("second-longer-line");
		await logger.info("third");
		await logger.flush();
		await logger.close();

		const current = readFileSync(logFile, "utf8").trim().split("\n");
		expect(current.length).toBeGreaterThanOrEqual(1);
		expect(current.some((line) => line.includes("third"))).toBe(true);

		const rotated = readFileSync(`${logFile}.1`, "utf8").trim().split("\n");
		expect(rotated.some((line) => line.includes("second-longer-line"))).toBe(
			true,
		);
	});
});

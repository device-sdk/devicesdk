import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dev from "./dev";

describe("dev command e2e", () => {
	// biome-ignore lint: test helper
	let consoleErrorSpy: any;
	// biome-ignore lint: test helper
	let processExitSpy: any;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should exit with error when no config file exists", async () => {
		// dev({}) resolves CWD (a directory), then loadConfig fails to find devicesdk.ts
		// loadConfig calls process.exit(4) which our mock throws
		// The error is caught by dev()'s outer try-catch, so dev() resolves
		await dev({});

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Config file not found"),
		);
		expect(processExitSpy).toHaveBeenCalledWith(4);
	});
});

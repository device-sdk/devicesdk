import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exitCodes";
import dev from "./dev";

describe("dev command error handling", () => {
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

	it("should display an error if the config file is not found", async () => {
		await expect(dev({ config: "non-existent-config.ts" })).rejects.toThrow(
			"process.exit",
		);

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Could not find"),
		);
		expect(processExitSpy).toHaveBeenCalledWith(EXIT.CONFIG_LOAD_FAILED);
	});
});

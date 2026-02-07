import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dev from "./dev";

describe("dev command error handling", () => {
	let consoleLogSpy: any;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should display an error if the config file is not found", async () => {
		await dev({ config: "non-existent-config.ts" });

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("coming soon"),
		);
	});
});

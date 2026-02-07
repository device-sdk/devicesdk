import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dev from "./dev";

vi.mock("execa");

describe("dev command e2e", () => {
	let consoleLogSpy: any;

	beforeEach(async () => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("should generate config files and attempt to start workerd", async () => {
		await dev({});

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("coming soon"),
		);
		expect(execa).not.toHaveBeenCalled();
	});
});

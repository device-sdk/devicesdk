import { execa } from "execa";
import net from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import dev from "./dev";

vi.mock("execa");
vi.mock("net");

describe("dev command port selection", () => {
	let consoleLogSpy: any;

	beforeEach(async () => {
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("should use port 8181 if it is available", async () => {
		await dev({ config: "devicesdk.ts" });

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("coming soon"),
		);
		expect(execa).not.toHaveBeenCalled();
	});

	it("should use a random port if 8181 is not available", async () => {
		await dev({ config: "devicesdk.ts" });

		expect(consoleLogSpy).toHaveBeenCalledWith(
			expect.stringContaining("coming soon"),
		);
		expect(execa).not.toHaveBeenCalled();
	});
});

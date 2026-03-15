import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import whoami from "./whoami.js";

vi.mock("../credentials.js", () => ({
	requireAuth: vi.fn().mockResolvedValue("test-token"),
}));

const getMeMock = vi.fn();
vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		getMe: (...args: Parameters<typeof original.getMe>) => getMeMock(...args),
	};
});

describe("whoami command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as never);

	const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});

	beforeEach(() => {
		vi.clearAllMocks();
		getMeMock.mockResolvedValue({
			id: "user-123",
			email: "test@example.com",
			name: "Test User",
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should print user info when logged in", async () => {
		const { requireAuth } = await import("../credentials.js");
		(requireAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			"test-token",
		);

		await whoami();

		expect(getMeMock).toHaveBeenCalledWith("test-token");
		expect(consoleLogSpy).toHaveBeenCalledWith(
			"Logged in as: test@example.com",
		);
		expect(consoleLogSpy).toHaveBeenCalledWith("User ID: user-123");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("should exit with 3 when not logged in", async () => {
		const { requireAuth } = await import("../credentials.js");
		const notLoggedInError = Object.assign(new Error("ENOENT: no such file"), {
			code: "ENOENT",
		});
		(requireAuth as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			notLoggedInError,
		);

		await expect(whoami()).rejects.toThrowError(/exit:3/);
		expect(exitSpy).toHaveBeenCalledWith(3);
		expect(getMeMock).not.toHaveBeenCalled();
	});

	it("should exit with 1 when getMe fails", async () => {
		const { requireAuth } = await import("../credentials.js");
		(requireAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
			"test-token",
		);
		getMeMock.mockRejectedValueOnce(new Error("Network error"));

		await expect(whoami()).rejects.toThrowError(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

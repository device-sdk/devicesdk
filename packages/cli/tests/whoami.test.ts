import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock both modules whoami imports so we don't touch the network or filesystem.
vi.mock("../src/api.js", () => ({
	getMe: vi.fn(),
}));
vi.mock("../src/credentials.js", () => ({
	requireAuth: vi.fn(),
}));

const { getMe } = await import("../src/api.js");
const { requireAuth } = await import("../src/credentials.js");
const whoami = (await import("../src/commands/whoami.js")).default;

describe("whoami", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		// process.exit throws so the command function aborts the way it would in
		// a real shell — without actually killing the test runner.
		exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
			throw new Error(`process.exit(${code})`);
		}) as never);
		delete process.env.DEVICESDK_OUTPUT;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("prints email + user id when authenticated", async () => {
		vi.mocked(requireAuth).mockResolvedValue("test-token");
		vi.mocked(getMe).mockResolvedValue({
			id: "user-abc",
			email: "alice@example.com",
			verified_email: 1,
			created_at: 0,
		});

		await whoami();

		expect(requireAuth).toHaveBeenCalledOnce();
		expect(getMe).toHaveBeenCalledWith("test-token");
		expect(logSpy).toHaveBeenCalledWith("Logged in as: alice@example.com");
		expect(logSpy).toHaveBeenCalledWith("User ID: user-abc");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("emits JSON success when --json is set", async () => {
		vi.mocked(requireAuth).mockResolvedValue("test-token");
		vi.mocked(getMe).mockResolvedValue({
			id: "user-abc",
			email: "alice@example.com",
			verified_email: 1,
			created_at: 0,
		});

		// emitJsonSuccess writes via process.stdout.write, not console.log
		const stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);

		await whoami({ json: true });

		const printed = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
		const parsed = JSON.parse(printed.trim());
		expect(parsed).toMatchObject({
			success: true,
			result: { id: "user-abc", email: "alice@example.com" },
		});
	});

	it("exits NOT_AUTHENTICATED when credentials file is missing", async () => {
		const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		vi.mocked(requireAuth).mockRejectedValue(enoent);

		await expect(whoami()).rejects.toThrow("process.exit(3)");

		expect(getMe).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalled();
		// Exit code 3 = NOT_AUTHENTICATED in EXIT enum
		expect(exitSpy).toHaveBeenCalledWith(3);
	});

	it("exits with generic error when getMe fails for non-auth reasons", async () => {
		vi.mocked(requireAuth).mockResolvedValue("test-token");
		vi.mocked(getMe).mockRejectedValue(new Error("network down"));

		await expect(whoami()).rejects.toThrow("process.exit(1)");

		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

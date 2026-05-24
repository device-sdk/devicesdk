import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/api.js", () => ({
	revokeToken: vi.fn(),
}));
vi.mock("../src/credentials.js", () => ({
	loadCredentials: vi.fn(),
	deleteCredentials: vi.fn(),
}));

const { revokeToken } = await import("../src/api.js");
const { loadCredentials, deleteCredentials } = await import(
	"../src/credentials.js"
);
const logout = (await import("../src/commands/logout.js")).default;

describe("logout", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
			throw new Error(`process.exit(${code})`);
		}) as never);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("revokes the access token and deletes credentials when logged in", async () => {
		vi.mocked(loadCredentials).mockResolvedValue({
			accessToken: "tok",
			refreshToken: "ref",
			expiresAt: Date.now() + 60_000,
			email: "alice@example.com",
		});
		vi.mocked(revokeToken).mockResolvedValue(undefined);
		vi.mocked(deleteCredentials).mockResolvedValue(undefined);

		await logout();

		expect(revokeToken).toHaveBeenCalledWith("tok");
		expect(deleteCredentials).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith("✓ Logged out successfully");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("succeeds even if revokeToken fails (API unreachable)", async () => {
		vi.mocked(loadCredentials).mockResolvedValue({
			accessToken: "tok",
			refreshToken: "ref",
			expiresAt: Date.now() + 60_000,
			email: "alice@example.com",
		});
		vi.mocked(revokeToken).mockRejectedValue(new Error("network down"));
		vi.mocked(deleteCredentials).mockResolvedValue(undefined);

		await logout();

		expect(deleteCredentials).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith("✓ Logged out successfully");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("still deletes credentials when none are loaded", async () => {
		vi.mocked(loadCredentials).mockResolvedValue(null);
		vi.mocked(deleteCredentials).mockResolvedValue(undefined);

		await logout();

		expect(revokeToken).not.toHaveBeenCalled();
		expect(deleteCredentials).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith("✓ Logged out successfully");
	});
});

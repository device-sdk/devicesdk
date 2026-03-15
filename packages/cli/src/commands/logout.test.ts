import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import logout from "./logout.js";

const loadCredentialsMock = vi.fn();
const deleteCredentialsMock = vi.fn();

vi.mock("../credentials.js", () => ({
	loadCredentials: (...args: Parameters<typeof loadCredentialsMock>) =>
		loadCredentialsMock(...args),
	deleteCredentials: (...args: Parameters<typeof deleteCredentialsMock>) =>
		deleteCredentialsMock(...args),
}));

const revokeTokenMock = vi.fn();
vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		revokeToken: (...args: Parameters<typeof original.revokeToken>) =>
			revokeTokenMock(...args),
	};
});

describe("logout command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as never);

	const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});

	beforeEach(() => {
		vi.clearAllMocks();
		loadCredentialsMock.mockResolvedValue({
			accessToken: "test-token",
			refreshToken: "test-refresh",
			expiresAt: Date.now() + 3600 * 1000,
			email: "test@example.com",
		});
		deleteCredentialsMock.mockResolvedValue(undefined);
		revokeTokenMock.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should log out successfully and revoke token", async () => {
		await logout();

		expect(loadCredentialsMock).toHaveBeenCalledOnce();
		expect(revokeTokenMock).toHaveBeenCalledWith("test-token");
		expect(deleteCredentialsMock).toHaveBeenCalledOnce();
		expect(consoleLogSpy).toHaveBeenCalledWith("✓ Logged out successfully");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("should log out successfully when no credentials exist", async () => {
		loadCredentialsMock.mockResolvedValueOnce(null);

		await logout();

		expect(revokeTokenMock).not.toHaveBeenCalled();
		expect(deleteCredentialsMock).toHaveBeenCalledOnce();
		expect(consoleLogSpy).toHaveBeenCalledWith("✓ Logged out successfully");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("should ignore revokeToken errors and still delete credentials", async () => {
		revokeTokenMock.mockRejectedValueOnce(new Error("Network error"));

		await logout();

		expect(deleteCredentialsMock).toHaveBeenCalledOnce();
		expect(consoleLogSpy).toHaveBeenCalledWith("✓ Logged out successfully");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("should exit with 1 when deleteCredentials fails", async () => {
		deleteCredentialsMock.mockRejectedValueOnce(new Error("Permission denied"));

		await expect(logout()).rejects.toThrowError(/exit:1/);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "../api.js";
import login from "./login.js";

vi.mock("open", () => ({
	default: vi.fn().mockResolvedValue(undefined),
}));

const credentialsMocks = {
	saveCredentials: vi.fn(),
};

vi.mock("../credentials.js", () => ({
	saveCredentials: (...args: unknown[]) =>
		credentialsMocks.saveCredentials(...args),
}));

const apiMocks = {
	startAuth: vi.fn(),
	pollAuth: vi.fn(),
	getMe: vi.fn(),
	setVerbose: vi.fn(),
};

vi.mock("../api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api.js")>();
	return {
		...original,
		startAuth: () => apiMocks.startAuth(),
		pollAuth: (...args: unknown[]) => apiMocks.pollAuth(...args),
		getMe: (...args: unknown[]) => apiMocks.getMe(...args),
		setVerbose: (...args: unknown[]) => apiMocks.setVerbose(...args),
	};
});

const START_AUTH_RESPONSE = {
	device_code: "device-code-abc",
	user_code: "WXYZ-9999",
	verification_url: "https://auth.devicesdk.com/verify",
	expires_in: 300,
	interval: 5,
};

const POLL_AUTH_RESPONSE = {
	access_token: "access-token-xyz",
	refresh_token: "refresh-token-xyz",
	expires_in: 3600,
};

const ME_RESPONSE = {
	id: "user-42",
	email: "dev@example.com",
};

describe("login command", () => {
	const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
		code?: number,
	) => {
		throw new Error(`exit:${code ?? 0}`);
	}) as any);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		apiMocks.startAuth.mockResolvedValue(START_AUTH_RESPONSE);
		apiMocks.pollAuth.mockResolvedValue(POLL_AUTH_RESPONSE);
		apiMocks.getMe.mockResolvedValue(ME_RESPONSE);
		credentialsMocks.saveCredentials.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should login successfully and save credentials", async () => {
		const loginPromise = login();
		await vi.runAllTimersAsync();
		await loginPromise;

		expect(apiMocks.startAuth).toHaveBeenCalledOnce();
		expect(apiMocks.pollAuth).toHaveBeenCalledWith(
			START_AUTH_RESPONSE.device_code,
		);
		expect(apiMocks.getMe).toHaveBeenCalledWith(
			POLL_AUTH_RESPONSE.access_token,
		);
		expect(credentialsMocks.saveCredentials).toHaveBeenCalledOnce();
		const savedCreds = credentialsMocks.saveCredentials.mock.calls[0][0];
		expect(savedCreds.accessToken).toBe(POLL_AUTH_RESPONSE.access_token);
		expect(savedCreds.refreshToken).toBe(POLL_AUTH_RESPONSE.refresh_token);
		expect(savedCreds.email).toBe(ME_RESPONSE.email);
		expect(typeof savedCreds.expiresAt).toBe("number");
	});

	it("should exit with code 1 when polling times out", async () => {
		apiMocks.pollAuth.mockResolvedValue(null);

		const loginPromise = login();
		// Attach rejection handler before advancing timers to avoid unhandled rejection
		const assertion = expect(loginPromise).rejects.toThrow("exit:1");
		// Advance past MAX_POLL_TIME (60000ms), triggering multiple poll cycles
		await vi.advanceTimersByTimeAsync(70000);
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
	});

	it("should exit with code 1 when startAuth fails", async () => {
		apiMocks.startAuth.mockRejectedValue(new Error("Network error"));

		await expect(login()).rejects.toThrow("exit:1");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
	});

	it("should retry getMe once on 401 and succeed", async () => {
		const authError = new DeviceSDKApiError("Unauthorized", 401);
		apiMocks.getMe
			.mockRejectedValueOnce(authError)
			.mockResolvedValueOnce(ME_RESPONSE);

		const loginPromise = login();
		await vi.runAllTimersAsync();
		await loginPromise;

		expect(apiMocks.getMe).toHaveBeenCalledTimes(2);
		expect(credentialsMocks.saveCredentials).toHaveBeenCalledOnce();
	});

	it("should exit with code 1 when getMe fails with a non-401 error", async () => {
		apiMocks.getMe.mockRejectedValue(new Error("Internal server error"));

		const loginPromise = login();
		// Attach rejection handler before advancing timers
		const assertion = expect(loginPromise).rejects.toThrow("exit:1");
		await vi.runAllTimersAsync();
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
	});

	it("should exit with code 1 when saveCredentials fails", async () => {
		credentialsMocks.saveCredentials.mockRejectedValue(new Error("Disk full"));

		const loginPromise = login();
		// Attach rejection handler before advancing timers
		const assertion = expect(loginPromise).rejects.toThrow("exit:1");
		await vi.runAllTimersAsync();
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});

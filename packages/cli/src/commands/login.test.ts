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
	const exitSpy = vi
		.spyOn(process, "exit")
		.mockImplementation((code?: number | string | null): never => {
			throw new Error(`exit:${code ?? 0}`);
		});

	const originalApiUrl = process.env.DEVICESDK_API_URL;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		// The vitest config sets DEVICESDK_API_URL so getApiUrl() resolves in
		// tests - leave it in place unless a test overrides it.
		apiMocks.startAuth.mockResolvedValue(START_AUTH_RESPONSE);
		apiMocks.pollAuth.mockResolvedValue(POLL_AUTH_RESPONSE);
		apiMocks.getMe.mockResolvedValue(ME_RESPONSE);
		credentialsMocks.saveCredentials.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		if (originalApiUrl === undefined) {
			delete process.env.DEVICESDK_API_URL;
		} else {
			process.env.DEVICESDK_API_URL = originalApiUrl;
		}
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
		// The fixture's expires_in is 300s - advance past it (5s interval x 61)
		await vi.advanceTimersByTimeAsync(310000);
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
	});

	it("reports a denied request instead of 'Authentication failed'", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		apiMocks.startAuth.mockResolvedValue(START_AUTH_RESPONSE);
		apiMocks.pollAuth.mockResolvedValueOnce("denied");

		const loginPromise = login();
		const assertion = expect(loginPromise).rejects.toThrow("exit:1");
		await vi.advanceTimersByTimeAsync(6000);
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(
			errorSpy.mock.calls.some(([msg]) =>
				String(msg).includes("Login request was denied"),
			),
		).toBe(true);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("polls on the server-provided interval", async () => {
		const loginPromise = login();
		// Fixture interval is 5s - nothing should poll before it elapses.
		await vi.advanceTimersByTimeAsync(4999);
		expect(apiMocks.pollAuth).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await loginPromise;

		expect(apiMocks.pollAuth).toHaveBeenCalledOnce();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("keeps polling past 60s while the server's expires_in allows it", async () => {
		let polls = 0;
		apiMocks.pollAuth.mockImplementation(() => {
			polls++;
			return polls >= 13
				? Promise.resolve(POLL_AUTH_RESPONSE)
				: Promise.resolve(null);
		});

		const loginPromise = login();
		// 60s in, 12 polls done, still waiting: the old 60s hard cap would
		// have aborted the login here even though the code is valid for 300s.
		await vi.advanceTimersByTimeAsync(60000);
		expect(exitSpy).not.toHaveBeenCalled();
		expect(polls).toBe(12);

		// One more interval resolves the login.
		await vi.advanceTimersByTimeAsync(5000);
		await loginPromise;

		expect(credentialsMocks.saveCredentials).toHaveBeenCalledOnce();
	});

	it("retries transient poll failures and succeeds", async () => {
		apiMocks.pollAuth
			.mockRejectedValueOnce(new TypeError("fetch failed"))
			.mockResolvedValue(POLL_AUTH_RESPONSE);

		const loginPromise = login();
		await vi.runAllTimersAsync();
		await loginPromise;

		expect(apiMocks.pollAuth).toHaveBeenCalledTimes(2);
		expect(credentialsMocks.saveCredentials).toHaveBeenCalledOnce();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("gives up after too many transient poll failures without printing a stack", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		apiMocks.pollAuth.mockRejectedValue(new TypeError("fetch failed"));

		const loginPromise = login();
		const assertion = expect(loginPromise).rejects.toThrow("exit:1");
		await vi.runAllTimersAsync();
		await assertion;

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(credentialsMocks.saveCredentials).not.toHaveBeenCalled();
		const printed = errorSpy.mock.calls.flat().join("\n");
		expect(printed).toContain("fetch failed");
		expect(printed).not.toContain("Stack:");
		errorSpy.mockRestore();
	});

	it("stores the env var URL when both DEVICESDK_API_URL and --host are set", async () => {
		process.env.DEVICESDK_API_URL = "http://env.example:8080";

		const loginPromise = login({ host: "http://flag.example:8080" });
		await vi.runAllTimersAsync();
		await loginPromise;

		const savedCreds = credentialsMocks.saveCredentials.mock.calls[0][0];
		expect(savedCreds.host).toBe("http://env.example:8080");
	});

	it("stores the normalized --host URL when no env var is set", async () => {
		delete process.env.DEVICESDK_API_URL;

		const loginPromise = login({ host: "flag.example:8080" });
		await vi.runAllTimersAsync();
		await loginPromise;

		const savedCreds = credentialsMocks.saveCredentials.mock.calls[0][0];
		expect(savedCreds.host).toBe("http://flag.example:8080");
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

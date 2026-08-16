import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DeviceSDKApiError,
	DeviceSDKTimeoutError,
	getMe,
	request,
	setVerbose,
} from "./api.js";

// Test the error-parsing surface of `request<T>` indirectly by mocking
// `fetch` and asserting the thrown DeviceSDKApiError. These exercise the
// shared `parseErrorBody` / `buildErrorMessage` helpers without exposing
// them as public API.

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockReset();
	setVerbose(false);
});

afterEach(() => {
	vi.unstubAllGlobals();
	setVerbose(false);
});

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("request error parsing", () => {
	it("collapses a refresh-token 401 (canonical string error) to 'Session expired'", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(401, {
				success: false,
				error: "invalid_refresh_token",
			}),
		);

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err).toBeInstanceOf(DeviceSDKApiError);
		expect(err.statusCode).toBe(401);
		expect(err.code).toBe("invalid_refresh_token");
		expect(err.message).toBe("Session expired - run `devicesdk login`.");
	});

	it("preserves a structured `{ error: { message, code } }` body", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(404, {
				success: false,
				error: {
					message: "Firmware artifact missing",
					code: "FIRMWARE_NOT_PUBLISHED",
				},
			}),
		);

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err).toBeInstanceOf(DeviceSDKApiError);
		expect(err.statusCode).toBe(404);
		expect(err.code).toBe("FIRMWARE_NOT_PUBLISHED");
		expect(err.message).toBe("Firmware artifact missing");
	});

	it("prefers a top-level `code` over a string `error`", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(404, {
				success: false,
				error: "Firmware for esp32c3 is not currently published.",
				code: "FIRMWARE_NOT_PUBLISHED",
			}),
		);

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err.code).toBe("FIRMWARE_NOT_PUBLISHED");
		expect(err.message).toBe(
			"Firmware for esp32c3 is not currently published.",
		);
	});

	it("does NOT treat a human error string as a programmatic code", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(404, {
				success: false,
				error: "User not found",
			}),
		);

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err.statusCode).toBe(404);
		// Spaces / sentences must not flow into `code` - that would mislead
		// downstream consumers that compare `err.code === "SOMETHING"`.
		expect(err.code).toBeUndefined();
		expect(err.message).toBe("User not found");
	});

	it("appends the re-auth hint on 401s that aren't auth-expired", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(401, {
				success: false,
				error: "Token missing required scope",
			}),
		);

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err.statusCode).toBe(401);
		expect(err.code).toBeUndefined();
		expect(err.message).toContain("Token missing required scope");
		expect(err.message).toContain("devicesdk login");
	});

	it("falls back to a generic message when the body has no error field", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(500, { foo: "bar" }));

		const err = (await getMe("tok").catch((e) => e)) as DeviceSDKApiError;
		expect(err.statusCode).toBe(500);
		expect(err.message).toBe("Request failed with status 500");
		expect(err.code).toBeUndefined();
	});

	it("does not dump the response body in non-verbose mode", async () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(
			jsonResponse(401, {
				success: false,
				error: "invalid_refresh_token",
			}),
		);

		await getMe("tok").catch(() => {});
		const printed = consoleErrorSpy.mock.calls.flat().join("\n");
		expect(printed).not.toContain("Response body");
		expect(printed).not.toContain("invalid_refresh_token");
		consoleErrorSpy.mockRestore();
	});

	it("dumps the response body when --verbose is set", async () => {
		setVerbose(true);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		fetchMock.mockResolvedValueOnce(
			jsonResponse(500, { success: false, error: "boom" }),
		);

		await getMe("tok").catch(() => {});
		const printed = consoleErrorSpy.mock.calls.flat().join("\n");
		expect(printed).toContain("Response body (500)");
		expect(printed).toContain("boom");
		consoleErrorSpy.mockRestore();
	});
});

describe("request timeout", () => {
	it("rejects with DeviceSDKTimeoutError when the server never responds", async () => {
		process.env.DEVICESDK_API_URL = "http://localhost:1";
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			// A fetch that hangs forever until the abort signal fires.
			fetchMock.mockImplementation(
				(_url: string, init: RequestInit | undefined) =>
					new Promise((_resolve, reject) => {
						const signal = init?.signal as AbortSignal | undefined;
						const abortError = new DOMException("Aborted", "AbortError");
						if (signal?.aborted) {
							reject(abortError);
							return;
						}
						signal?.addEventListener("abort", () => reject(abortError));
					}),
			);

			const promise = request("/v1/user/me", { timeoutMs: 1000 });
			// Attach the rejection handler before advancing so the timeout
			// rejection is not reported as unhandled.
			const result = promise.then(
				() => "resolved",
				(err: unknown) => err,
			);
			await vi.advanceTimersByTimeAsync(1100);
			const err = (await result) as DeviceSDKTimeoutError;
			expect(err).toBeInstanceOf(DeviceSDKTimeoutError);
			expect(err.message).toBe("Server not responding after 1s");
			// The timeout signal must actually be wired to fetch.
			const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(init.signal).toBeInstanceOf(AbortSignal);
		} finally {
			vi.useRealTimers();
			delete process.env.DEVICESDK_API_URL;
		}
	});

	it("does not apply a timeout when the request completes normally", async () => {
		process.env.DEVICESDK_API_URL = "http://localhost:1";
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { success: true, result: { id: "u1" } }),
		);

		const me = await request<{ id: string }>("/v1/user/me");
		expect(me).toEqual({ id: "u1" });
		delete process.env.DEVICESDK_API_URL;
	});

	it("fallback (no AbortSignal.any): the timeout still fires when a caller signal is combined", async () => {
		// Simulate Node <20.3 where AbortSignal.any does not exist. The old
		// combineSignals fallback returned only the caller's signal, silently
		// dropping the timeout for that request - this regression asserts the
		// composed signal aborts when the timeout fires, without touching the
		// caller's signal.
		const originalAny = AbortSignal.any;
		Object.defineProperty(AbortSignal, "any", {
			value: undefined as unknown as typeof AbortSignal.any,
			configurable: true,
		});
		process.env.DEVICESDK_API_URL = "http://localhost:1";
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			const callerController = new AbortController();
			fetchMock.mockImplementation(
				(_url: string, init: RequestInit | undefined) =>
					new Promise((_resolve, reject) => {
						const signal = init?.signal as AbortSignal | undefined;
						const abortError = new DOMException("Aborted", "AbortError");
						if (signal?.aborted) {
							reject(abortError);
							return;
						}
						signal?.addEventListener("abort", () => reject(abortError));
					}),
			);

			const promise = request("/v1/user/me", {
				timeoutMs: 1000,
				signal: callerController.signal,
			});
			const result = promise.then(
				() => "resolved",
				(err: unknown) => err,
			);
			await vi.advanceTimersByTimeAsync(1100);
			const err = (await result) as DeviceSDKTimeoutError;
			expect(err).toBeInstanceOf(DeviceSDKTimeoutError);
			// The timeout (not the caller) aborted the request.
			expect(callerController.signal.aborted).toBe(false);
		} finally {
			vi.useRealTimers();
			delete process.env.DEVICESDK_API_URL;
			Object.defineProperty(AbortSignal, "any", {
				value: originalAny,
				configurable: true,
			});
		}
	});

	it("fallback (no AbortSignal.any): an already-aborted caller signal fails fast, not as a timeout", async () => {
		const originalAny = AbortSignal.any;
		Object.defineProperty(AbortSignal, "any", {
			value: undefined as unknown as typeof AbortSignal.any,
			configurable: true,
		});
		process.env.DEVICESDK_API_URL = "http://localhost:1";
		try {
			const callerController = new AbortController();
			callerController.abort();
			fetchMock.mockImplementation(
				(_url: string, init: RequestInit | undefined) =>
					new Promise((_resolve, reject) => {
						const signal = init?.signal as AbortSignal | undefined;
						const abortError = new DOMException("Aborted", "AbortError");
						if (signal?.aborted) {
							reject(abortError);
							return;
						}
						signal?.addEventListener("abort", () => reject(abortError));
					}),
			);

			const err = (await request("/v1/user/me", {
				signal: callerController.signal,
			}).catch((e: unknown) => e)) as DOMException;
			expect(err.name).toBe("AbortError");
			expect(err).not.toBeInstanceOf(DeviceSDKTimeoutError);
		} finally {
			delete process.env.DEVICESDK_API_URL;
			Object.defineProperty(AbortSignal, "any", {
				value: originalAny,
				configurable: true,
			});
		}
	});

	it("forwards the caller's abort in the AbortSignal.any path (no timeout mask)", async () => {
		process.env.DEVICESDK_API_URL = "http://localhost:1";
		try {
			const callerController = new AbortController();
			fetchMock.mockImplementation(
				(_url: string, init: RequestInit | undefined) =>
					new Promise((_resolve, reject) => {
						const signal = init?.signal as AbortSignal | undefined;
						const abortError = new DOMException("Aborted", "AbortError");
						if (signal?.aborted) {
							reject(abortError);
							return;
						}
						signal?.addEventListener("abort", () => reject(abortError));
					}),
			);

			const promise = request("/v1/user/me", {
				signal: callerController.signal,
			});
			const settled = promise.then(
				() => "resolved",
				(err: unknown) => err,
			);
			callerController.abort();
			const err = (await settled) as DOMException;
			expect(err.name).toBe("AbortError");
			expect(err).not.toBeInstanceOf(DeviceSDKTimeoutError);
		} finally {
			delete process.env.DEVICESDK_API_URL;
		}
	});
});

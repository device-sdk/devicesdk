import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError, getMe, setVerbose } from "./api.js";

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

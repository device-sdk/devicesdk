import fs from "node:fs/promises";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSDKApiError } from "./api.js";
import type { Credentials } from "./credentials.js";
import {
	deleteCredentials,
	getToken,
	loadCredentials,
	requireAuth,
	saveCredentials,
} from "./credentials.js";

const refreshTokenMock = vi.fn();

vi.mock("./api.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("./api.js")>();
	return {
		...original,
		refreshToken: (...args: Parameters<typeof original.refreshToken>) =>
			refreshTokenMock(...args),
	};
});

function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
	return {
		accessToken: "access-token-123",
		refreshToken: "refresh-token-abc",
		expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
		email: "alice@example.com",
		...overrides,
	};
}

describe("credentials", () => {
	let readFileSpy: MockInstance;
	let writeFileSpy: MockInstance;
	let mkdirSpy: MockInstance;
	let unlinkSpy: MockInstance;

	beforeEach(() => {
		vi.resetAllMocks();
		delete process.env.DEVICESDK_TOKEN;

		readFileSpy = vi
			.spyOn(fs, "readFile")
			.mockRejectedValue(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);
		writeFileSpy = vi
			.spyOn(fs, "writeFile")
			.mockResolvedValue(undefined as never);
		mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined as never);
		unlinkSpy = vi.spyOn(fs, "unlink").mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("loadCredentials", () => {
		it("should return null when credentials file does not exist", async () => {
			const result = await loadCredentials();
			expect(result).toBeNull();
		});

		it("should return parsed credentials when file exists", async () => {
			const creds = makeCredentials();
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));

			const result = await loadCredentials();
			expect(result).toEqual(creds);
		});
	});

	describe("saveCredentials", () => {
		it("should create directory and write credentials file", async () => {
			const creds = makeCredentials();

			await saveCredentials(creds);

			expect(mkdirSpy).toHaveBeenCalledWith(
				expect.stringContaining(".devicesdk"),
				{ recursive: true },
			);
			expect(writeFileSpy).toHaveBeenCalledWith(
				expect.stringContaining("credentials.json"),
				JSON.stringify(creds, null, 2),
				{ mode: 0o600 },
			);
		});
	});

	describe("deleteCredentials", () => {
		it("should delete the credentials file", async () => {
			await deleteCredentials();

			expect(unlinkSpy).toHaveBeenCalledWith(
				expect.stringContaining("credentials.json"),
			);
		});

		it("should not throw when credentials file does not exist", async () => {
			unlinkSpy.mockRejectedValue(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);

			await expect(deleteCredentials()).resolves.toBeUndefined();
		});
	});

	describe("getToken", () => {
		it("should return env var token when DEVICESDK_TOKEN is set", async () => {
			process.env.DEVICESDK_TOKEN = "env-token-xyz";

			const result = await getToken();
			expect(result).toBe("env-token-xyz");
		});

		it("should return null when no credentials exist", async () => {
			const result = await getToken();
			expect(result).toBeNull();
		});

		it("should return access token when token is not expired", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
			});
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));

			const result = await getToken();
			expect(result).toBe(creds.accessToken);
		});

		it("should refresh and return new token when token is expired", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));
			refreshTokenMock.mockResolvedValue({
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				expires_in: 3600,
				token_type: "Bearer",
			});

			const result = await getToken();
			expect(result).toBe("new-access-token");
			expect(writeFileSpy).toHaveBeenCalledWith(
				expect.stringContaining("credentials.json"),
				expect.stringContaining("new-access-token"),
				{ mode: 0o600 },
			);
		});

		it("should return null when token is expired and refresh fails (network)", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));
			refreshTokenMock.mockRejectedValue(new Error("Refresh failed"));

			const result = await getToken();
			expect(result).toBeNull();
		});

		it("should return SESSION_EXPIRED sentinel when refresh returns 401", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));
			refreshTokenMock.mockRejectedValue(
				new DeviceSDKApiError(
					"Session expired - run `devicesdk login`.",
					401,
					"invalid_refresh_token",
				),
			);

			const result = await getToken();
			// Sentinel is internal - it's not null and not a string, which is enough
			// for requireAuth() to dispatch on it. We exercise the surfaced
			// behaviour in the requireAuth describe block below.
			expect(result).not.toBeNull();
			expect(typeof result).not.toBe("string");
		});
	});

	describe("requireAuth", () => {
		let processExitSpy: MockInstance;
		let consoleErrorSpy: MockInstance;

		beforeEach(() => {
			processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
				throw new Error("process.exit");
			}) as never);
			consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		it("should return the access token when authenticated", async () => {
			const creds = makeCredentials();
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));

			const result = await requireAuth();
			expect(result).toBe(creds.accessToken);
		});

		it("should exit with code 3 when not authenticated", async () => {
			await expect(requireAuth()).rejects.toThrow("process.exit");
			expect(processExitSpy).toHaveBeenCalledWith(3);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Authentication required"),
			);
		});

		it("should print 'Session expired' (no body dump) on refresh-token 401", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));
			refreshTokenMock.mockRejectedValue(
				new DeviceSDKApiError(
					"Session expired - run `devicesdk login`.",
					401,
					"invalid_refresh_token",
				),
			);

			await expect(requireAuth()).rejects.toThrow("process.exit");
			expect(processExitSpy).toHaveBeenCalledWith(3);
			const printed = consoleErrorSpy.mock.calls.flat().join("\n");
			expect(printed).toContain("Session expired");
			// Must NOT include the prior raw body dump format.
			expect(printed).not.toContain("Response body");
			expect(printed).not.toContain("invalid_refresh_token");
		});

		describe("DEVICESDK_OUTPUT=json mode", () => {
			let stdoutSpy: MockInstance;
			const originalEnv = process.env.DEVICESDK_OUTPUT;

			beforeEach(() => {
				process.env.DEVICESDK_OUTPUT = "json";
				stdoutSpy = vi
					.spyOn(process.stdout, "write")
					.mockImplementation(() => true);
			});

			afterEach(() => {
				if (originalEnv === undefined) delete process.env.DEVICESDK_OUTPUT;
				else process.env.DEVICESDK_OUTPUT = originalEnv;
			});

			it("emits JSON with code=not_authenticated when no credentials are present", async () => {
				await expect(requireAuth()).rejects.toThrow("process.exit");
				expect(processExitSpy).toHaveBeenCalledWith(3);
				const lastWrite = stdoutSpy.mock.calls.at(-1)?.[0] as string;
				const payload = JSON.parse(lastWrite);
				expect(payload).toMatchObject({
					success: false,
					code: "not_authenticated",
					docs: "https://devicesdk.com/docs/cli/login/",
				});
				expect(payload.error).toMatch(/Authentication required/);
				// Stderr must stay clean so MCP / agents see only the JSON.
				expect(consoleErrorSpy).not.toHaveBeenCalled();
			});

			it("emits JSON with code=session_expired when refresh fails", async () => {
				const creds = makeCredentials({ expiresAt: Date.now() - 1000 });
				readFileSpy.mockResolvedValue(Buffer.from(JSON.stringify(creds)));
				refreshTokenMock.mockRejectedValue(
					new DeviceSDKApiError(
						"Session expired",
						401,
						"invalid_refresh_token",
					),
				);

				await expect(requireAuth()).rejects.toThrow("process.exit");
				expect(processExitSpy).toHaveBeenCalledWith(3);
				const lastWrite = stdoutSpy.mock.calls.at(-1)?.[0] as string;
				const payload = JSON.parse(lastWrite);
				expect(payload).toMatchObject({
					success: false,
					code: "session_expired",
					docs: "https://devicesdk.com/docs/cli/login/",
				});
				expect(consoleErrorSpy).not.toHaveBeenCalled();
			});
		});
	});
});

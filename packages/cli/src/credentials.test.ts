import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		// biome-ignore lint/suspicious/noExplicitAny: test helper
		refreshToken: (...args: any[]) => refreshTokenMock(...args),
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
	let readFileSpy: ReturnType<typeof vi.spyOn>;
	let writeFileSpy: ReturnType<typeof vi.spyOn>;
	let mkdirSpy: ReturnType<typeof vi.spyOn>;
	let unlinkSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetAllMocks();
		delete process.env.DEVICESDK_TOKEN;

		readFileSpy = vi.spyOn(fs, "readFile");
		writeFileSpy = vi
			.spyOn(fs, "writeFile")
			.mockResolvedValue(undefined as never);
		mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined as never);
		unlinkSpy = vi.spyOn(fs, "unlink").mockResolvedValue(undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.DEVICESDK_TOKEN;
	});

	describe("loadCredentials", () => {
		it("should return null when credentials file does not exist", async () => {
			readFileSpy.mockRejectedValue(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);

			const result = await loadCredentials();
			expect(result).toBeNull();
		});

		it("should return parsed credentials when file exists", async () => {
			const creds = makeCredentials();
			readFileSpy.mockResolvedValue(JSON.stringify(creds) as unknown as Buffer);

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
			readFileSpy.mockRejectedValue(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);

			const result = await getToken();
			expect(result).toBeNull();
		});

		it("should return access token when token is not expired", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
			});
			readFileSpy.mockResolvedValue(JSON.stringify(creds) as unknown as Buffer);

			const result = await getToken();
			expect(result).toBe(creds.accessToken);
		});

		it("should refresh and return new token when token is expired", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(JSON.stringify(creds) as unknown as Buffer);
			refreshTokenMock.mockResolvedValue({
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				expires_in: 3600,
				token_type: "Bearer",
			});

			const result = await getToken();
			expect(result).toBe("new-access-token");
			expect(writeFileSpy).toHaveBeenCalled();
		});

		it("should return null when token is expired and refresh fails", async () => {
			const creds = makeCredentials({
				expiresAt: Date.now() - 1000, // expired
			});
			readFileSpy.mockResolvedValue(JSON.stringify(creds) as unknown as Buffer);
			refreshTokenMock.mockRejectedValue(new Error("Refresh failed"));

			const result = await getToken();
			expect(result).toBeNull();
		});
	});

	describe("requireAuth", () => {
		let processExitSpy: ReturnType<typeof vi.spyOn>;
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
				throw new Error("process.exit");
			}) as never);
			consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		it("should return the access token when authenticated", async () => {
			const creds = makeCredentials();
			readFileSpy.mockResolvedValue(JSON.stringify(creds) as unknown as Buffer);

			const result = await requireAuth();
			expect(result).toBe(creds.accessToken);
		});

		it("should exit with code 3 when not authenticated", async () => {
			readFileSpy.mockRejectedValue(
				Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
			);

			await expect(requireAuth()).rejects.toThrow("process.exit");
			expect(processExitSpy).toHaveBeenCalledWith(3);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Authentication required"),
			);
		});
	});
});

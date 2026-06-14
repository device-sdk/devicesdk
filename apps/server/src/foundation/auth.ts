import type { Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { FetchTypes } from "workers-qb";
import type { AppContext, tableUser, tableUserSessions } from "../types";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "./consts";
import { hashToken, legacyHashToken } from "./tokenHash";

function getToken(c: AppContext): null | string {
	const authHeader = c.req.header("Authorization");
	const authCookie = getCookie(c, SESSION_COOKIE_NAME);

	if (authHeader) {
		if (authHeader.toLowerCase().substring(0, 6) !== "bearer") {
			return null;
		}
		return authHeader.substring(6).trim();
	}

	if (!authCookie) {
		return null;
	}

	return authCookie;
}

/** Random opaque session token (hex). */
export function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
	c: AppContext,
	userId: string,
): Promise<{ token: string; expiresAt: number }> {
	const now = Date.now();
	const expiresAt = now + SESSION_DURATION_MS;
	const session = await c
		.get("qb")
		.insert<tableUserSessions>({
			tableName: "user_sessions",
			data: {
				user_id: userId,
				token: generateSessionToken(),
				expires_at: expiresAt,
				created_at: now,
			},
			returning: "*",
		})
		.execute();

	if (!session.results) {
		throw new Error("unable to create a new user session");
	}
	return { token: session.results.token, expiresAt };
}

export function setSessionCookie(
	c: AppContext,
	token: string,
	expiresAt: number,
): void {
	// Host-only cookie (no Domain attribute) — the dashboard is served from
	// the same origin as the API on a self-hosted server. Secure is opt-in
	// via SECURE_COOKIES because most home installs run plain HTTP on a LAN.
	setCookie(c, SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		expires: new Date(expiresAt),
		sameSite: "Lax",
		secure: c.env.config.secureCookies,
		path: "/",
	});
}

export function clearSessionCookie(c: AppContext): void {
	setCookie(c, SESSION_COOKIE_NAME, "", {
		httpOnly: true,
		expires: new Date(0),
		sameSite: "Lax",
		secure: c.env.config.secureCookies,
		path: "/",
	});
}

function getLoginRedirectUrl(returnUrl: string, c: AppContext): string {
	// In local dev the dashboard runs on the quasar dev server; on a real
	// install it's served same-origin by this server.
	const dashboardBase = c.env.ENV === "local" ? "http://localhost:9000" : "";

	// Only pass through same-host return URLs to prevent open redirects.
	let safeReturnUrl = "";
	try {
		const parsed = new URL(returnUrl);
		const requestHost = new URL(c.req.url).hostname;
		if (parsed.hostname === requestHost || parsed.hostname === "localhost") {
			safeReturnUrl = returnUrl;
		}
	} catch {
		if (returnUrl.startsWith("/")) {
			safeReturnUrl = `${dashboardBase}${returnUrl}`;
		}
	}

	if (safeReturnUrl) {
		return `${dashboardBase}/login?redirect_uri=${encodeURIComponent(safeReturnUrl)}`;
	}
	return `${dashboardBase}/login`;
}

export async function cliAuthUser(c: AppContext, next: Next) {
	// Call the regular authenticateUser middleware
	const response = await authenticateUser(c, next);

	// If authenticateUser returned a response (auth failed), redirect instead
	if (response instanceof Response) {
		const currentUrl = c.req.url;
		const loginUrl = getLoginRedirectUrl(currentUrl, c);
		return c.redirect(loginUrl);
	}
}

export async function authenticateUser(c: AppContext, next: Next) {
	const token = getToken(c);

	if (!token) {
		return Response.json(
			{
				success: false,
				error:
					"Missing credentials. Provide a Bearer token, session cookie, or `dsdk_*` CLI token.",
				code: "missing_credentials",
				docs: "https://devicesdk.com/docs/errors/missing_credentials/",
			},
			{
				status: 401,
			},
		);
	}

	// Check if it's a CLI token (dsdk_ prefix)
	if (token.startsWith("dsdk_") && !token.startsWith("dsdk_refresh_")) {
		const secret = c.env.config.apiTokenSecret;
		const tokenHashes = [
			await hashToken(token, secret),
			await legacyHashToken(token),
		];

		const cliToken = await c
			.get("qb")
			.raw<{
				id: string;
				user_id: string;
				name: string;
				email: string;
				picture: string;
				verified_email: number;
				onboarding_completed: number;
				user_created_at: number;
			}>({
				query: `SELECT ct.id, u.id as user_id, u.name, u.email, u.picture, u.verified_email, u.onboarding_completed, u.created_at as user_created_at
				 FROM cli_tokens ct
				 JOIN user u ON ct.user_id = u.id
				 WHERE ct.access_token_hash IN (?1, ?2) AND ct.expires_at > ?3`,
				args: [tokenHashes[0], tokenHashes[1], Date.now()],
				fetchType: FetchTypes.ONE,
			})
			.execute();

		if (!cliToken.results) {
			return Response.json(
				{
					success: false,
					error:
						"CLI token is invalid or expired. Run `devicesdk login` to issue a fresh one.",
					code: "invalid_cli_token",
					docs: "https://devicesdk.com/docs/errors/invalid_cli_token/",
				},
				{
					status: 401,
				},
			);
		}

		await c
			.get("qb")
			.raw({
				query: "UPDATE cli_tokens SET last_used_at = ?1 WHERE id = ?2",
				args: [Date.now(), cliToken.results.id],
			})
			.execute();

		const cliUser: tableUser = {
			id: cliToken.results.user_id,
			name: cliToken.results.name,
			email: cliToken.results.email,
			picture: cliToken.results.picture,
			verified_email: cliToken.results.verified_email,
			// CLI tokens are issued to users who have already onboarded; default to 1
			// so the wizard never appears in CLI-authenticated contexts.
			onboarding_completed: cliToken.results.onboarding_completed ?? 1,
			created_at: cliToken.results.user_created_at,
		};
		c.set("user", cliUser);
		await next();
		return;
	}

	const session = await c
		.get("qb")
		.fetchOne<tableUser>({
			tableName: "user_sessions us",
			fields: "u.*",
			join: {
				table: "user u",
				on: "us.user_id = u.id",
			},
			where: {
				conditions: ["us.token = ?1", "us.expires_at > ?2"],
				params: [token, Date.now()],
			},
		})
		.execute();

	if (!session.results) {
		// Hash the incoming token for comparison (HMAC first, legacy SHA-256 fallback).
		const secret = c.env.config.apiTokenSecret;
		const apiTokenHashes = [
			await hashToken(token, secret),
			await legacyHashToken(token),
		];

		// Look up by hash
		const tokenUser = await c
			.get("qb")
			.fetchOne<tableUser>({
				tableName: "tokens t",
				fields: "u.*",
				join: {
					table: "user u",
					on: "t.user_id = u.id",
				},
				where: {
					conditions: ["t.token_hash IN (?1, ?2)"],
					params: [apiTokenHashes[0], apiTokenHashes[1]],
				},
			})
			.execute();

		if (!tokenUser.results) {
			return Response.json(
				{
					success: false,
					error:
						"Token is invalid or expired. For CLI tokens (dsdk_*), run `devicesdk login`. For dashboard sessions, sign in again.",
					code: "invalid_token",
					docs: "https://devicesdk.com/docs/errors/invalid_token/",
				},
				{
					status: 401,
				},
			);
		}

		c.set("user", tokenUser.results);
		await next();
		return;
	}

	c.set("user", session.results);
	await next();
}

export async function handleLogout(c: AppContext) {
	// Delete session from database
	const token = getCookie(c, SESSION_COOKIE_NAME);
	if (token) {
		await c
			.get("qb")
			.delete({
				tableName: "user_sessions",
				where: {
					conditions: ["token = ?1"],
					params: [token],
				},
			})
			.execute();
	}

	clearSessionCookie(c);

	return c.json({
		success: true,
		message: "Logged out successfully",
	});
}

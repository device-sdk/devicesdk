import type { AppContext, tableUser, tableUserSessions } from "../types";
import type { Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "./consts";
import type { GoogleUser } from "@hono/oauth-providers/google";
import { ApiException } from "chanfana";

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

async function hashTokenSha256(token: string): Promise<string> {
	const utf8 = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((bytes) => bytes.toString(16).padStart(2, "0")).join("");
}

function getLoginRedirectUrl(returnUrl: string, env: any): string {
	const dashboardUrl =
		env.ENV === "local"
			? "http://localhost:9000"
			: "https://dash.devicesdk.com";
	const encodedReturnUrl = encodeURIComponent(returnUrl);
	return `${dashboardUrl}/login?redirect_uri=${encodedReturnUrl}`;
}

export async function cliAuthUser(c: AppContext, next: Next) {
	// Call the regular authenticateUser middleware
	const response = await authenticateUser(c, next);

	// If authenticateUser returned a response (auth failed), redirect instead
	if (response instanceof Response) {
		const currentUrl = c.req.url;
		const loginUrl = getLoginRedirectUrl(currentUrl, c.env);
		return c.redirect(loginUrl);
	}
}

export async function authenticateUser(c: AppContext, next: Next) {
	const token = getToken(c);

	if (!token) {
		return Response.json(
			{
				success: false,
				errors: "Authentication error",
			},
			{
				status: 401,
			},
		);
	}

	// Check if it's a CLI token (dsdk_ prefix)
	if (token.startsWith("dsdk_") && !token.startsWith("dsdk_refresh_")) {
		const tokenHash = await hashTokenSha256(token);

		const cliToken = await c.env.DB.prepare(
			`SELECT ct.*, u.id as user_id, u.name, u.email, u.picture, u.verified_email, u.created_at as user_created_at
			 FROM cli_tokens ct
			 JOIN user u ON ct.user_id = u.id
			 WHERE ct.access_token_hash = ? AND ct.expires_at > ?`,
		)
			.bind(tokenHash, Date.now())
			.first<{
				id: string;
				user_id: string;
				name: string;
				email: string;
				picture: string;
				verified_email: number;
				user_created_at: number;
			}>();

		if (!cliToken) {
			return Response.json(
				{
					success: false,
					errors: "Authentication error",
				},
				{
					status: 401,
				},
			);
		}

		// Update last_used_at
		await c.env.DB.prepare(
			"UPDATE cli_tokens SET last_used_at = ? WHERE id = ?",
		)
			.bind(Date.now(), cliToken.id)
			.run();

		c.set("user", {
			id: cliToken.user_id,
			name: cliToken.name,
			email: cliToken.email,
			picture: cliToken.picture,
			verified_email: cliToken.verified_email,
			created_at: cliToken.user_created_at,
		});
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
					conditions: ["t.token = ?1"],
					params: [token],
				},
			})
			.execute();

		if (!tokenUser.results) {
			return Response.json(
				{
					success: false,
					errors: "Authentication error",
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

export async function handleGoogleCallback(c: AppContext) {
	const googleUser = c.get("user-google") as Partial<GoogleUser>;
	const currentMs = Date.now();

	if (!googleUser.email) {
		throw new ApiException("Google account does not have an email");
	}

	let user = await c
		.get("qb")
		.insert<tableUser>({
			tableName: "user",
			onConflict: "IGNORE",
			data: {
				id: crypto.randomUUID(),
				name: googleUser.name || googleUser.given_name || "",
				email: googleUser.email || "",
				picture: googleUser.picture || "",
				verified_email: googleUser.verified_email === true ? 1 : 0,
				created_at: currentMs,
			},
			returning: "*",
		})
		.execute();

	if (!user.results) {
		user = await c
			.get("qb")
			.fetchOne<tableUser>({
				tableName: "user",
				where: {
					conditions: ["email = ?1"],
					params: [googleUser.email],
				},
			})
			.execute();
	}

	if (!user.results) {
		throw new ApiException("unable to get or create a user");
	}

	const expiration = currentMs + SESSION_DURATION_MS;
	const session = await c
		.get("qb")
		.insert<tableUserSessions>({
			tableName: "user_sessions",
			data: {
				user_id: user.results.id,
				token: await hashPassword(
					(Math.random() + 1).toString(3),
					c.env.SALT_TOKEN,
				),
				expires_at: expiration,
				created_at: currentMs,
			},
			returning: "*",
		})
		.execute();

	if (!session.results) {
		throw new ApiException("unable to create a new user session");
	}

	const expirationDate = new Date(expiration);

	if (c.env.ENV === "local") {
		setCookie(c, SESSION_COOKIE_NAME, session.results.token, {
			httpOnly: true,
			expires: expirationDate,
			domain: ".localhost",
			sameSite: "None",
			secure: true,
			path: "/",
		});

		return c.redirect("http://localhost:9000");
	}

	setCookie(c, SESSION_COOKIE_NAME, session.results.token, {
		httpOnly: true,
		expires: expirationDate,
		domain: ".devicesdk.com",
		sameSite: "None",
		secure: true,
		path: "/",
	});

	return c.redirect("https://dash.devicesdk.com");
}

export async function handleLogout(c: AppContext) {
	if (c.env.ENV === "local") {
		setCookie(c, SESSION_COOKIE_NAME, "", {
			httpOnly: true,
			expires: new Date(0),
			domain: ".localhost",
			sameSite: "None",
			secure: true,
			path: "/",
		});
	} else {
		setCookie(c, SESSION_COOKIE_NAME, "", {
			httpOnly: true,
			expires: new Date(0),
			domain: ".devicesdk.com",
			sameSite: "None",
			secure: true,
			path: "/",
		});
	}

	return c.json({
		success: true,
		message: "Logged out successfully",
	});
}

export async function hashPassword(
	password: string,
	salt: string,
): Promise<string> {
	const utf8 = new TextEncoder().encode(`${salt}:${password}`);

	const hashBuffer = await crypto.subtle.digest({ name: "SHA-256" }, utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((bytes) => bytes.toString(16).padStart(2, "0")).join("");
}

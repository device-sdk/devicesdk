import { FetchTypes } from "workers-qb";
import { z } from "zod";
import {
	clearSessionCookie,
	createSession,
	setSessionCookie,
} from "../../foundation/auth";
import type { AppContext, tableUser } from "../../types";

const RegisterSchema = z.object({
	email: z.email().max(254),
	password: z.string().min(8).max(256),
	name: z.string().min(1).max(100).optional(),
});

const LoginSchema = z.object({
	email: z.email().max(254),
	password: z.string().min(1).max(256),
});

function sanitizeUser(user: tableUser): Omit<tableUser, "password_hash"> {
	const { password_hash: _password_hash, ...rest } = user;
	return rest;
}

async function userCount(c: AppContext): Promise<number> {
	const row = await c
		.get("qb")
		.raw<{ n: number }>({
			query: "SELECT COUNT(*) AS n FROM user",
			fetchType: FetchTypes.ONE,
		})
		.execute();
	return row.results?.n ?? 0;
}

/**
 * GET /v1/auth/status — pre-auth probe for the dashboard login page:
 * whether any account exists (first-run setup) and whether registration
 * is open.
 */
export async function handleAuthStatus(c: AppContext) {
	const count = await userCount(c);
	return c.json({
		success: true,
		result: {
			has_users: count > 0,
			registration_enabled: c.env.config.allowRegistration || count === 0,
		},
	});
}

/** POST /v1/auth/register — create a local account + session. */
export async function handleRegister(c: AppContext) {
	const body = RegisterSchema.safeParse(await c.req.json().catch(() => null));
	if (!body.success) {
		return c.json(
			{
				success: false,
				error:
					"Invalid registration payload: email and a password of at least 8 characters are required.",
			},
			400,
		);
	}

	const existingUsers = await userCount(c);
	if (existingUsers > 0 && !c.env.config.allowRegistration) {
		return c.json(
			{
				success: false,
				error:
					"Registration is disabled on this server (ALLOW_REGISTRATION=false).",
			},
			403,
		);
	}

	const email = body.data.email.toLowerCase();
	const passwordHash = await Bun.password.hash(body.data.password);
	const now = Date.now();

	const inserted = await c
		.get("qb")
		.raw<tableUser>({
			query: `INSERT INTO user (id, name, email, picture, verified_email, password_hash, created_at)
			 VALUES (?1, ?2, ?3, '', 1, ?4, ?5)
			 ON CONFLICT (email) DO NOTHING
			 RETURNING *`,
			args: [
				crypto.randomUUID(),
				body.data.name ?? email.split("@")[0],
				email,
				passwordHash,
				now,
			],
			fetchType: FetchTypes.ONE,
		})
		.execute();

	if (!inserted.results) {
		return c.json(
			{ success: false, error: "An account with this email already exists." },
			409,
		);
	}

	const session = await createSession(c, inserted.results.id);
	setSessionCookie(c, session.token, session.expiresAt);
	return c.json({ success: true, result: sanitizeUser(inserted.results) });
}

/** POST /v1/auth/login — verify password, issue a session. */
export async function handleLogin(c: AppContext) {
	const body = LoginSchema.safeParse(await c.req.json().catch(() => null));
	if (!body.success) {
		return c.json({ success: false, error: "Invalid login payload." }, 400);
	}

	const user = await c
		.get("qb")
		.fetchOne<tableUser>({
			tableName: "user",
			where: {
				conditions: ["email = ?1"],
				params: [body.data.email.toLowerCase()],
			},
		})
		.execute();

	// Verify against a constant dummy hash when the user doesn't exist so the
	// response time doesn't leak which emails are registered.
	const hash =
		user.results?.password_hash ??
		"$argon2id$v=19$m=65536,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	const valid = await Bun.password
		.verify(body.data.password, hash)
		.catch(() => false);

	if (!user.results || !user.results.password_hash || !valid) {
		clearSessionCookie(c);
		return c.json({ success: false, error: "Invalid email or password." }, 401);
	}

	const session = await createSession(c, user.results.id);
	setSessionCookie(c, session.token, session.expiresAt);
	return c.json({ success: true, result: sanitizeUser(user.results) });
}

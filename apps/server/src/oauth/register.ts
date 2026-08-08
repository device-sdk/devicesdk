import { z } from "zod";
import type { AppContext } from "../types";
import { insertClient, oauthJsonError } from "./store";

const RegisterSchema = z.object({
	client_name: z.string().trim().min(1).max(100),
	redirect_uris: z.array(z.string()).min(1),
});

/**
 * Explicit allowlist for redirect_uris (no blocklist): https with any host,
 * or http only on loopback hosts (127.0.0.1, ::1, localhost) with any port.
 * Everything else - custom schemes (javascript:, data:, cursor://, ...) and
 * http on non-loopback hosts - is rejected, because a redirect_uri is a
 * privileged post-authorization delivery target: a scriptable or remote-http
 * target would let a rogue client exfiltrate authorization codes.
 */
function isValidRedirectUri(raw: string): boolean {
	try {
		const url = new URL(raw);
		if (!url.hostname) return false;
		// RFC 3986 deprecates userinfo in http(s) URIs; reject it so a host
		// check can't be confused by embedded credentials.
		if (url.username || url.password) return false;
		if (url.protocol === "https:") return true;
		if (url.protocol === "http:") {
			// WHATWG hostname keeps the brackets for IPv6 literals.
			const host = url.hostname.replace(/^\[|\]$/g, "");
			return host === "localhost" || host === "127.0.0.1" || host === "::1";
		}
		return false;
	} catch {
		return false;
	}
}

/** POST /oauth/register - RFC 7591 dynamic client registration. */
export async function handleRegisterClient(c: AppContext) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"Request body must be JSON.",
		);
	}

	const parsed = RegisterSchema.safeParse(body);
	if (!parsed.success) {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"client_name (non-empty string) and redirect_uris (non-empty array of strings) are required.",
		);
	}

	const { redirect_uris, client_name } = parsed.data;
	if (!redirect_uris.every(isValidRedirectUri)) {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"Every redirect_uri must be https, or http on a loopback host (127.0.0.1, ::1, or localhost).",
		);
	}

	const client = await insertClient(c, {
		clientName: client_name.trim(),
		redirectUris: redirect_uris,
	});

	return c.json(
		{
			client_id: client.id,
			client_name: client.client_name,
			redirect_uris: client.redirect_uris,
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		},
		201,
	);
}

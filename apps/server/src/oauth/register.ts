import { z } from "zod";
import type { AppContext } from "../types";
import { insertClient, oauthJsonError } from "./store";

const RegisterSchema = z.object({
	client_name: z.string().trim().min(1).max(100),
	redirect_uris: z.array(z.string()).min(1),
});

/**
 * Explicit allowlist for redirect_uris - what a redirect URI is allowed to be
 * is decided here (registration) and enforced everywhere else by exact-match
 * against the stored value (authorize + token exchange), so all three paths
 * agree on one canonical policy.
 *
 * Accepted:
 * - `https` with any host (no userinfo)
 * - `http` on a loopback host (127.0.0.1, ::1, localhost) or a private-LAN
 *   host (RFC1918 + link-local IPs, unique-local/link-local IPv6, and *.local
 *   mDNS names) - the self-hosted LAN product's documented non-TLS case
 * - custom schemes for native-app redirect handlers (`cursor://`, `vscode://`,
 *   ...) - the code is delivered to a local handler, not a browser context
 *
 * Rejected:
 * - scriptable/embedding schemes (`javascript:`, `data:`, `vbscript:`,
 *   `file:`, `about:`) that would execute or inline the authorization code
 * - `http` on public hosts and userinfo in any http(s) URI (host confusion)
 */
const DANGEROUS_REDIRECT_SCHEMES = new Set([
	"javascript:",
	"data:",
	"vbscript:",
	"file:",
	"about:",
]);

function isLoopbackHost(host: string): boolean {
	return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isPrivateNetworkHost(host: string): boolean {
	// IPv4 RFC1918 (10/8, 172.16/12, 192.168/16) + link-local (169.254/16).
	if (
		host.startsWith("10.") ||
		host.startsWith("192.168.") ||
		host.startsWith("169.254.")
	) {
		return true;
	}
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
	if (/^f[cd][0-9a-f]/.test(host)) return true;
	if (/^fe[89ab][0-9a-f]/.test(host)) return true;
	// mDNS names (*.local) only resolve within the LAN.
	return host.endsWith(".local");
}

function isValidRedirectUri(raw: string): boolean {
	try {
		const url = new URL(raw);
		// RFC 3986 deprecates userinfo in http(s) URIs; reject it so a host
		// check can't be confused by embedded credentials.
		if (url.username || url.password) return false;
		const protocol = url.protocol.toLowerCase();
		if (protocol === "https:") {
			return url.hostname.length > 0;
		}
		if (protocol === "http:") {
			// WHATWG hostname keeps the brackets for IPv6 literals.
			const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
			return isLoopbackHost(host) || isPrivateNetworkHost(host);
		}
		if (DANGEROUS_REDIRECT_SCHEMES.has(protocol)) return false;
		return protocol.length > 1;
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
			"Every redirect_uri must be https, or http on a loopback or private-LAN host, or a native-app custom scheme (cursor:// and similar). Scriptable schemes and http on public hosts are rejected.",
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

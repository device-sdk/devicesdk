import { isIP } from "node:net";
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

/** Strict dotted-quad IPv4 parse: 4 octets, decimal, 0-255, no leading zeros. */
function parseIpv4Octets(text: string): number[] | null {
	const parts = text.split(".");
	if (parts.length !== 4) return null;
	const octets: number[] = [];
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return null;
		if (part.length > 1 && part.startsWith("0")) return null;
		const value = Number(part);
		if (value > 255) return null;
		octets.push(value);
	}
	return octets;
}

/**
 * Expand an IPv6 literal into its 16 address bytes, or null for anything that
 * is not a complete IPv6 address. Range decisions must come from the actual
 * bits, never from textual prefix matches (0fe8::1 is not fe80::/10), which
 * is why the address is fully expanded first. The dotted-quad tail of
 * IPv4-mapped forms (::ffff:192.168.1.1) is handled as two hextets.
 */
function ipv6ToBytes(host: string): number[] | null {
	const text = host.toLowerCase();
	if (text.length === 0 || text.length > 45 || text.includes("%")) return null;
	if (text.indexOf("::") !== text.lastIndexOf("::")) return null;

	// Split into a head and (when compressed) a tail, count hextets, then
	// expand to bytes. A dotted-quad group is only legal as the final group
	// and spans two hextets (4 octets).
	const compressIdx = text.indexOf("::");
	const headText = compressIdx === -1 ? text : text.slice(0, compressIdx);
	const tailText = compressIdx === -1 ? "" : text.slice(compressIdx + 2);

	const parseHextets = (chunk: string): number[] | null => {
		if (chunk === "") return [];
		const groups = chunk.split(":");
		const hextets: number[] = [];
		for (let i = 0; i < groups.length; i++) {
			const group = groups[i];
			if (group === "") return null;
			if (group.includes(".")) {
				if (i !== groups.length - 1) return null;
				const octets = parseIpv4Octets(group);
				if (!octets) return null;
				hextets.push(
					(octets[0] << 8) | octets[1],
					(octets[2] << 8) | octets[3],
				);
				continue;
			}
			if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
			hextets.push(Number.parseInt(group, 16));
		}
		return hextets;
	};

	const head = parseHextets(headText);
	const tail = parseHextets(tailText);
	if (!head || !tail) return null;
	if (compressIdx === -1 && head.length !== 8) return null;
	if (compressIdx !== -1 && 8 - (head.length + tail.length) < 1) return null;

	const bytes: number[] = [];
	for (const hextet of [
		...head,
		...Array<number>(8 - head.length - tail.length).fill(0),
		...tail,
	]) {
		bytes.push((hextet >> 8) & 0xff, hextet & 0xff);
	}
	return bytes;
}

function isIpv4Private(octets: readonly number[]): boolean {
	const [a, b] = octets;
	return (
		a === 10 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 169 && b === 254)
	);
}

function isIpv6Private(bytes: readonly number[]): boolean {
	// fc00::/7 unique-local and fe80::/10 link-local, judged on the first
	// hextet of the actual address.
	const firstHextet = (bytes[0] << 8) | bytes[1];
	if ((firstHextet & 0xfe00) === 0xfc00) return true;
	if ((firstHextet & 0xffc0) === 0xfe80) return true;
	// IPv4-mapped (::ffff:0:0/96) targets the embedded IPv4 address, which is
	// the same host a plain IPv4 literal would reach - judge that one.
	const isMapped =
		bytes.slice(0, 10).every((b) => b === 0) &&
		bytes[10] === 0xff &&
		bytes[11] === 0xff;
	if (isMapped) return isIpv4Private(bytes.slice(12, 16));
	return false;
}

function isPrivateNetworkHost(host: string): boolean {
	// RFC1918 (10/8, 172.16/12, 192.168/16) + IPv4 link-local (169.254/16),
	// matched on actual IP literals only. A DNS name that merely starts with
	// one of these prefixes (10.evil.com, 192.168.evil.com) resolves on the
	// public internet and is NOT private.
	if (isIP(host) === 4) {
		const octets = parseIpv4Octets(host);
		if (octets && isIpv4Private(octets)) return true;
	}
	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10) likewise apply
	// only to well-formed literals (fca.example.com, fe8b.example.com are
	// public hostnames, not addresses).
	if (isIP(host) === 6) {
		const bytes = ipv6ToBytes(host);
		if (bytes && isIpv6Private(bytes)) return true;
	}
	// mDNS names (*.local) only resolve within the LAN.
	return host.endsWith(".local");
}

export function isValidRedirectUri(raw: string): boolean {
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

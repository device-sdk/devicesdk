// Multicast-DNS responder advertising this server as `<hostname>.local`.
//
// Self-hosted devices (ESP32/Pico) can then be flashed with a stable hostname
// like `devicesdk.local:8080` and resolve the server's current LAN IP over
// mDNS — no static IP required. The advertised name is configurable so several
// DeviceSDK servers can coexist on one network (`devicesdk.local`,
// `devicesdk-2.local`, …).
//
// Zero dependencies: a tiny hand-rolled responder over `node:dgram` (Bun's
// multicast support is verified working). We only answer A queries for our own
// name; we never act as a general-purpose resolver.

import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { logger } from "../logger";
import { encodeAResponse, parseQuery, TYPE_A, TYPE_ANY } from "./dnsPacket";

const MDNS_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;

export interface MdnsResponder {
	/** The fully-qualified advertised name, e.g. `devicesdk.local`. */
	readonly fqdn: string;
	/** Stop announcing (sends a TTL-0 goodbye) and close the socket. */
	stop(): void;
}

export interface StartMdnsOptions {
	/** Short hostname without the `.local` suffix, e.g. `devicesdk`. */
	hostname: string;
	/** UDP port to bind; defaults to the standard mDNS port 5353. Injectable for tests. */
	port?: number;
	/** Override the advertised IPv4 addresses; defaults to live LAN interfaces. */
	getAddresses?: () => string[];
}

/** Non-internal IPv4 addresses across all interfaces, recomputed each call. */
export function localIpv4Addresses(): string[] {
	const out: string[] = [];
	for (const addrs of Object.values(networkInterfaces())) {
		if (!addrs) continue;
		for (const addr of addrs) {
			// `family` is "IPv4" on Node 18+/Bun (older Node used the number 4).
			const isV4 = addr.family === "IPv4" || (addr.family as unknown) === 4;
			if (isV4 && !addr.internal) out.push(addr.address);
		}
	}
	return out;
}

/**
 * Pure core: decide how to answer a single inbound packet. Returns an encoded
 * A response if the packet is a query for `<hostname>.local` (type A or ANY)
 * and we have at least one address; otherwise `null`. Kept free of I/O so it
 * can be exhaustively unit-tested without sockets.
 */
export function buildResponseForQuery(
	packet: Uint8Array,
	fqdn: string,
	addresses: string[],
): Uint8Array | null {
	if (addresses.length === 0) return null;
	const parsed = parseQuery(packet);
	if (!parsed || parsed.isResponse) return null;
	const target = fqdn.toLowerCase();
	const wanted = parsed.questions.some(
		(q) => q.name === target && (q.type === TYPE_A || q.type === TYPE_ANY),
	);
	if (!wanted) return null;
	return encodeAResponse({ name: fqdn, addresses, id: parsed.id });
}

/**
 * Start the responder. Binds the mDNS multicast group, answers matching
 * queries (unicast back to the querier — deterministic and sufficient for the
 * one-shot resolvers in lwIP/ESP-IDF), and sends a gratuitous announcement on
 * start so caches populate before the first query.
 */
export function startMdnsResponder(options: StartMdnsOptions): MdnsResponder {
	const fqdn = `${options.hostname}.local`;
	const port = options.port ?? MDNS_PORT;
	const getAddresses = options.getAddresses ?? localIpv4Addresses;
	const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
	let closed = false;

	socket.on("error", (err) => {
		logger.error(err, "mDNS responder socket error", { fqdn });
		socket.close();
	});

	socket.on("message", (msg, rinfo) => {
		if (closed) return;
		try {
			const response = buildResponseForQuery(msg, fqdn, getAddresses());
			if (response) socket.send(response, rinfo.port, rinfo.address);
		} catch (err) {
			logger.error(err, "mDNS responder failed handling query", { fqdn });
		}
	});

	socket.on("listening", () => {
		try {
			socket.addMembership(MDNS_ADDRESS);
		} catch (err) {
			// Multicast join can fail in containers without a multicast route;
			// the responder still answers unicast queries, so log and continue.
			logger.warn("mDNS multicast join failed; unicast-only", {
				fqdn,
				errorMessage: (err as Error).message,
			});
		}
		announce();
		logger.info("mDNS responder advertising", {
			fqdn,
			addresses: getAddresses(),
		});
	});

	function announce(ttl?: number) {
		const addresses = getAddresses();
		if (addresses.length === 0) return;
		const packet = encodeAResponse({ name: fqdn, addresses, ttl });
		socket.send(packet, MDNS_PORT, MDNS_ADDRESS);
	}

	socket.bind(port);

	return {
		fqdn,
		stop() {
			if (closed) return;
			closed = true;
			// RFC 6762 §10.1 goodbye: re-announce with TTL 0 so caches evict us.
			try {
				announce(0);
			} catch {
				// best-effort on shutdown
			}
			socket.close();
		},
	};
}

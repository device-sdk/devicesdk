// Lightweight mDNS client for discovering a self-hosted DeviceSDK server on the
// local network. When the CLI has no explicit `--host`, no DEVICESDK_API_URL,
// and no stored credentials, it can multicast a query for
// `<hostname>.local` (default `devicesdk.local`) and use the first A-record
// response as the server IP.
//
// This is intentionally dependency-free: it uses Node's built-in `dgram` and a
// tiny DNS wire codec scoped to A-record queries/answers.

import dgram from "node:dgram";

const MDNS_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;
const DEFAULT_SERVER_PORT = 8080;
const DEFAULT_TIMEOUT_MS = 1500;

const TYPE_A = 1;
const CLASS_IN = 1;

export interface MdnsDiscoveryOptions {
	/** Short hostname (without `.local`) or fully-qualified name. */
	hostname?: string;
	/** How long to wait for a response in ms (default 1500). */
	timeoutMs?: number;
	/** DeviceSDK HTTP port to append to the discovered IP (default 8080). */
	serverPort?: number;
}

function normalizeHostname(input?: string): string {
	const base = (
		input ??
		process.env.DEVICESDK_MDNS_HOSTNAME ??
		"devicesdk"
	).trim();
	const lower = base.toLowerCase();
	return lower.endsWith(".local") ? lower : `${lower}.local`;
}

function getServerPort(optionsPort?: number): number {
	if (optionsPort !== undefined) return optionsPort;
	const envPort = Number(process.env.DEVICESDK_MDNS_PORT);
	return Number.isInteger(envPort) && envPort > 0
		? envPort
		: DEFAULT_SERVER_PORT;
}

function encodeName(name: string): Uint8Array {
	const labels = name.split(".").filter((label) => label.length > 0);
	let size = 1; // terminating zero
	for (const label of labels) size += 1 + label.length;
	const out = new Uint8Array(size);
	let offset = 0;
	for (const label of labels) {
		out[offset++] = label.length;
		for (let i = 0; i < label.length; i++) {
			out[offset++] = label.charCodeAt(i);
		}
	}
	out[offset] = 0;
	return out;
}

function encodeAQuery(name: string): Uint8Array {
	const nameBytes = encodeName(name);
	const buf = new Uint8Array(12 + nameBytes.length + 4);
	const view = new DataView(buf.buffer);
	view.setUint16(0, 0); // ID
	view.setUint16(2, 0); // flags: standard query
	view.setUint16(4, 1); // QDCOUNT
	view.setUint16(6, 0); // ANCOUNT
	view.setUint16(8, 0); // NSCOUNT
	view.setUint16(10, 0); // ARCOUNT
	let offset = 12;
	buf.set(nameBytes, offset);
	offset += nameBytes.length;
	view.setUint16(offset, TYPE_A);
	view.setUint16(offset + 2, CLASS_IN);
	return buf;
}

function readName(
	buf: Uint8Array,
	start: number,
): { name: string; offset: number } | null {
	const labels: string[] = [];
	let offset = start;
	let jumped = false;
	let nextOffset = start;
	let guard = 0;

	while (true) {
		if (offset >= buf.length) return null;
		if (guard++ > 128) return null; // pointer loop / pathological input
		const len = buf[offset];
		if (len === 0) {
			if (!jumped) nextOffset = offset + 1;
			break;
		}
		if ((len & 0xc0) === 0xc0) {
			// Compression pointer: top two bits set, 14-bit offset follows.
			if (offset + 1 >= buf.length) return null;
			if (!jumped) nextOffset = offset + 2;
			offset = ((len & 0x3f) << 8) | buf[offset + 1];
			jumped = true;
			continue;
		}
		if ((len & 0xc0) !== 0) return null; // reserved label type
		const labelStart = offset + 1;
		if (labelStart + len > buf.length) return null;
		labels.push(
			String.fromCharCode(...buf.subarray(labelStart, labelStart + len)),
		);
		offset = labelStart + len;
	}
	return { name: labels.join("."), offset: nextOffset };
}

function parseIpv4(octets: Uint8Array, start: number): string {
	return `${octets[start]}.${octets[start + 1]}.${octets[start + 2]}.${octets[start + 3]}`;
}

/**
 * Parse A-record answers from an mDNS response packet. Returns the IPv4
 * addresses that match `targetName` in the order they appear.
 */
export function parseAResponses(
	packet: Uint8Array,
	targetName: string,
): string[] {
	if (packet.length < 12) return [];
	const view = new DataView(
		packet.buffer,
		packet.byteOffset,
		packet.byteLength,
	);
	const isResponse = (view.getUint16(2) & 0x8000) !== 0;
	if (!isResponse) return [];

	const target = targetName.toLowerCase();
	const ips: string[] = [];
	let offset = 12;

	// Skip question section.
	const qdcount = view.getUint16(4);
	for (let i = 0; i < qdcount; i++) {
		const parsed = readName(packet, offset);
		if (!parsed) return [];
		offset = parsed.offset + 4; // type + class
	}

	const ancount = view.getUint16(6);
	for (let i = 0; i < ancount; i++) {
		const parsed = readName(packet, offset);
		if (!parsed) return [];
		offset = parsed.offset;
		if (offset + 10 > packet.length) return [];
		const type = view.getUint16(offset);
		const rclass = view.getUint16(offset + 2);
		const rdlength = view.getUint16(offset + 8);
		offset += 10;
		if (offset + rdlength > packet.length) return [];
		if (
			type === TYPE_A &&
			(rclass & 0x7fff) === CLASS_IN &&
			parsed.name.toLowerCase() === target &&
			rdlength === 4
		) {
			ips.push(parseIpv4(packet, offset));
		}
		offset += rdlength;
	}

	return ips;
}

/**
 * Discover a DeviceSDK server via mDNS. Sends an A-record query for the
 * configured hostname and returns a usable `http://<ip>:<port>` URL, or `null`
 * if no answer arrives within the timeout.
 */
export async function discoverMdnsHost(
	options?: MdnsDiscoveryOptions,
): Promise<string | null> {
	const fqdn = normalizeHostname(options?.hostname);
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const serverPort = getServerPort(options?.serverPort);

	return new Promise((resolve) => {
		const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
		let resolved = false;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

		function finish(result: string | null) {
			if (resolved) return;
			resolved = true;
			clearTimeout(timeoutHandle);
			try {
				socket.close();
			} catch {
				// best-effort
			}
			resolve(result);
		}

		socket.on("error", () => finish(null));

		socket.on("message", (msg) => {
			try {
				const ips = parseAResponses(msg, fqdn);
				if (ips.length > 0) {
					finish(`http://${ips[0]}:${serverPort}`);
				}
			} catch {
				// malformed packet — ignore
			}
		});

		socket.on("listening", () => {
			try {
				socket.addMembership(MDNS_ADDRESS);
			} catch {
				// Multicast join can fail in restricted networks; the query may
				// still reach the local segment on some systems.
			}
			const query = encodeAQuery(fqdn);
			socket.send(query, MDNS_PORT, MDNS_ADDRESS, (err) => {
				if (err) finish(null);
			});
		});

		timeoutHandle = setTimeout(() => finish(null), timeoutMs);
		socket.bind();
	});
}

// Minimal multicast-DNS (RFC 6762) / DNS (RFC 1035) wire codec.
//
// Scope is deliberately narrow: we only ever need to *parse* incoming queries
// and *encode* an A-record answer advertising this server's `<hostname>.local`
// name. No compression pointers are emitted; names are written as plain label
// sequences. Parsing handles compression pointers in questions (some resolvers
// use them) but we only read QNAMEs, never RDATA.

/** Resource-record / question type for an IPv4 address. */
export const TYPE_A = 1;
/** Wildcard question type ("any record"). One-shot mDNS clients often use it. */
export const TYPE_ANY = 255;
/** Internet class. */
export const CLASS_IN = 1;
/** Top bit of the rrclass: cache-flush on answers, unicast-reply on questions. */
export const FLAG_TOP_BIT = 0x8000;

export interface DnsQuestion {
	/** Lower-cased dotted name, e.g. `devicesdk.local` (mDNS is case-insensitive). */
	name: string;
	type: number;
	/** rrclass with the top (QU) bit masked off. */
	qclass: number;
	/** QU bit was set - the querier prefers a unicast response. */
	unicast: boolean;
}

export interface ParsedQuery {
	id: number;
	/** QR bit - true for responses, which we ignore. */
	isResponse: boolean;
	questions: DnsQuestion[];
}

/**
 * Parse a DNS message far enough to read its questions. Returns `null` for
 * malformed input (truncated header, name running off the end, bad pointer)
 * rather than throwing - a responder must never crash on a stray packet.
 */
export function parseQuery(buf: Uint8Array): ParsedQuery | null {
	if (buf.length < 12) return null;
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const id = view.getUint16(0);
	const flags = view.getUint16(2);
	const isResponse = (flags & 0x8000) !== 0;
	const qdcount = view.getUint16(4);

	const questions: DnsQuestion[] = [];
	let offset = 12;
	for (let i = 0; i < qdcount; i++) {
		const parsed = readName(buf, offset);
		if (!parsed) return null;
		offset = parsed.offset;
		// type (2) + class (2)
		if (offset + 4 > buf.length) return null;
		const type = view.getUint16(offset);
		const rawClass = view.getUint16(offset + 2);
		offset += 4;
		questions.push({
			name: parsed.name.toLowerCase(),
			type,
			qclass: rawClass & ~FLAG_TOP_BIT,
			unicast: (rawClass & FLAG_TOP_BIT) !== 0,
		});
	}
	return { id, isResponse, questions };
}

/** Read a QNAME (label sequence) starting at `offset`, following pointers. */
function readName(
	buf: Uint8Array,
	start: number,
): { name: string; offset: number } | null {
	const labels: string[] = [];
	let offset = start;
	let jumped = false;
	// Offset to return to the caller (the byte after the name in the question
	// section), captured before the first pointer jump.
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
		labels.push(asciiSlice(buf, labelStart, labelStart + len));
		offset = labelStart + len;
	}
	return { name: labels.join("."), offset: nextOffset };
}

function asciiSlice(buf: Uint8Array, start: number, end: number): string {
	let out = "";
	for (let i = start; i < end; i++) out += String.fromCharCode(buf[i]);
	return out;
}

export interface AAnswer {
	/** Dotted name to answer for, e.g. `devicesdk.local`. */
	name: string;
	/** Dotted IPv4 strings to return, one A record each. */
	addresses: string[];
	/** TTL in seconds (default 120, the mDNS convention for host records). */
	ttl?: number;
	/** Echo the query id (mDNS responders typically use 0). */
	id?: number;
}

/**
 * Encode an mDNS response carrying one A record per address. The cache-flush
 * bit is set on each answer's rrclass (RFC 6762 §10.2), as is conventional for
 * unique host records.
 */
export function encodeAResponse(answer: AAnswer): Uint8Array {
	const ttl = answer.ttl ?? 120;
	const id = answer.id ?? 0;
	const nameBytes = encodeName(answer.name);
	const addrs = answer.addresses;

	// header(12) + question-free + answers
	const perAnswer = nameBytes.length + 2 + 2 + 4 + 2 + 4; // name+type+class+ttl+rdlen+rdata
	const buf = new Uint8Array(12 + perAnswer * addrs.length);
	const view = new DataView(buf.buffer);
	view.setUint16(0, id); // ID
	view.setUint16(2, 0x8400); // flags: QR=1, AA=1
	view.setUint16(4, 0); // QDCOUNT
	view.setUint16(6, addrs.length); // ANCOUNT
	view.setUint16(8, 0); // NSCOUNT
	view.setUint16(10, 0); // ARCOUNT

	let offset = 12;
	for (const addr of addrs) {
		buf.set(nameBytes, offset);
		offset += nameBytes.length;
		view.setUint16(offset, TYPE_A);
		offset += 2;
		view.setUint16(offset, CLASS_IN | FLAG_TOP_BIT); // cache-flush
		offset += 2;
		view.setUint32(offset, ttl);
		offset += 4;
		view.setUint16(offset, 4); // RDLENGTH (IPv4)
		offset += 2;
		const octets = parseIpv4(addr);
		buf.set(octets, offset);
		offset += 4;
	}
	return buf;
}

/** Encode a dotted name as a length-prefixed label sequence ending in a 0 byte. */
export function encodeName(name: string): Uint8Array {
	const labels = name.split(".").filter((l) => l.length > 0);
	let size = 1; // terminating zero
	for (const label of labels) size += 1 + label.length;
	const out = new Uint8Array(size);
	let offset = 0;
	for (const label of labels) {
		out[offset++] = label.length;
		for (let i = 0; i < label.length; i++) out[offset++] = label.charCodeAt(i);
	}
	out[offset] = 0;
	return out;
}

/** Parse a dotted IPv4 string into 4 octets; throws on malformed input. */
export function parseIpv4(addr: string): Uint8Array {
	const parts = addr.split(".");
	if (parts.length !== 4) throw new Error(`invalid IPv4 address: ${addr}`);
	const out = new Uint8Array(4);
	for (let i = 0; i < 4; i++) {
		const n = Number(parts[i]);
		if (!Number.isInteger(n) || n < 0 || n > 255) {
			throw new Error(`invalid IPv4 address: ${addr}`);
		}
		out[i] = n;
	}
	return out;
}

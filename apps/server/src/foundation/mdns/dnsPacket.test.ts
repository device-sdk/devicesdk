import { describe, expect, test } from "bun:test";
import {
	CLASS_IN,
	encodeAResponse,
	encodeName,
	FLAG_TOP_BIT,
	parseIpv4,
	parseQuery,
	TYPE_A,
	TYPE_ANY,
} from "./dnsPacket";

/** Build a minimal DNS query buffer for a single question. */
function buildQuery(
	name: string,
	type: number,
	{ id = 0x1234, unicast = false }: { id?: number; unicast?: boolean } = {},
): Uint8Array {
	const nameBytes = encodeName(name);
	const buf = new Uint8Array(12 + nameBytes.length + 4);
	const view = new DataView(buf.buffer);
	view.setUint16(0, id);
	view.setUint16(2, 0x0000); // QR=0 query
	view.setUint16(4, 1); // QDCOUNT
	buf.set(nameBytes, 12);
	const offset = 12 + nameBytes.length;
	view.setUint16(offset, type);
	view.setUint16(offset + 2, CLASS_IN | (unicast ? FLAG_TOP_BIT : 0));
	return buf;
}

describe("encodeName", () => {
	test("encodes a multi-label name as length-prefixed labels", () => {
		expect([...encodeName("devicesdk.local")]).toEqual([
			9,
			...[..."devicesdk"].map((c) => c.charCodeAt(0)),
			5,
			...[..."local"].map((c) => c.charCodeAt(0)),
			0,
		]);
	});
});

describe("parseIpv4", () => {
	test("parses dotted quad", () => {
		expect([...parseIpv4("192.168.1.42")]).toEqual([192, 168, 1, 42]);
	});
	test("rejects malformed addresses", () => {
		expect(() => parseIpv4("192.168.1")).toThrow();
		expect(() => parseIpv4("256.0.0.1")).toThrow();
		expect(() => parseIpv4("a.b.c.d")).toThrow();
	});
});

describe("parseQuery", () => {
	test("decodes a single A question", () => {
		const parsed = parseQuery(buildQuery("devicesdk.local", TYPE_A));
		expect(parsed).not.toBeNull();
		expect(parsed?.isResponse).toBe(false);
		expect(parsed?.id).toBe(0x1234);
		expect(parsed?.questions).toEqual([
			{
				name: "devicesdk.local",
				type: TYPE_A,
				qclass: CLASS_IN,
				unicast: false,
			},
		]);
	});

	test("lower-cases the name and reads the QU bit", () => {
		const parsed = parseQuery(
			buildQuery("DeviceSDK.Local", TYPE_ANY, { unicast: true }),
		);
		expect(parsed?.questions[0]).toEqual({
			name: "devicesdk.local",
			type: TYPE_ANY,
			qclass: CLASS_IN,
			unicast: true,
		});
	});

	test("returns null for truncated input", () => {
		expect(parseQuery(new Uint8Array(4))).toBeNull();
	});

	test("returns null when a name runs off the end", () => {
		// QDCOUNT says 1 question but the buffer ends mid-name.
		const buf = new Uint8Array(12 + 2);
		const view = new DataView(buf.buffer);
		view.setUint16(4, 1);
		buf[12] = 9; // claims a 9-byte label with no bytes following
		expect(parseQuery(buf)).toBeNull();
	});
});

describe("encodeAResponse", () => {
	test("round-trips through a structural decode", () => {
		const packet = encodeAResponse({
			name: "devicesdk.local",
			addresses: ["192.168.1.42"],
			id: 0,
		});
		const view = new DataView(
			packet.buffer,
			packet.byteOffset,
			packet.byteLength,
		);
		expect(view.getUint16(2)).toBe(0x8400); // QR=1, AA=1
		expect(view.getUint16(4)).toBe(0); // QDCOUNT
		expect(view.getUint16(6)).toBe(1); // ANCOUNT

		// Skip the name (label sequence) to reach the answer fields.
		let offset = 12;
		while (packet[offset] !== 0) offset += packet[offset] + 1;
		offset += 1;
		expect(view.getUint16(offset)).toBe(TYPE_A);
		expect(view.getUint16(offset + 2)).toBe(CLASS_IN | FLAG_TOP_BIT); // cache-flush
		expect(view.getUint32(offset + 4)).toBe(120); // default TTL
		expect(view.getUint16(offset + 8)).toBe(4); // RDLENGTH
		expect([...packet.slice(offset + 10, offset + 14)]).toEqual([
			192, 168, 1, 42,
		]);
	});

	test("emits one answer per address", () => {
		const packet = encodeAResponse({
			name: "devicesdk.local",
			addresses: ["192.168.1.42", "10.0.0.5"],
		});
		const view = new DataView(
			packet.buffer,
			packet.byteOffset,
			packet.byteLength,
		);
		expect(view.getUint16(6)).toBe(2); // ANCOUNT
	});
});

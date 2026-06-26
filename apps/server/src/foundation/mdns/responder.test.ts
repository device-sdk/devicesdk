import { afterEach, describe, expect, test } from "bun:test";
import dgram from "node:dgram";
import {
	CLASS_IN,
	encodeName,
	parseQuery,
	TYPE_A,
	TYPE_ANY,
} from "./dnsPacket";
import {
	buildResponseForQuery,
	localIpv4Addresses,
	type MdnsResponder,
	startMdnsResponder,
} from "./responder";

function buildQuery(name: string, type: number): Uint8Array {
	const nameBytes = encodeName(name);
	const buf = new Uint8Array(12 + nameBytes.length + 4);
	const view = new DataView(buf.buffer);
	view.setUint16(0, 0x4242);
	view.setUint16(4, 1); // QDCOUNT
	buf.set(nameBytes, 12);
	const offset = 12 + nameBytes.length;
	view.setUint16(offset, type);
	view.setUint16(offset + 2, CLASS_IN);
	return buf;
}

const ADDRS = ["192.168.1.42"];

describe("buildResponseForQuery", () => {
	test("answers an A query for our name", () => {
		const res = buildResponseForQuery(
			buildQuery("devicesdk.local", TYPE_A),
			"devicesdk.local",
			ADDRS,
		);
		expect(res).not.toBeNull();
		const parsed = new DataView((res as Uint8Array).buffer);
		expect(parsed.getUint16(6)).toBe(1); // one answer
	});

	test("answers an ANY query for our name", () => {
		const res = buildResponseForQuery(
			buildQuery("devicesdk.local", TYPE_ANY),
			"devicesdk.local",
			ADDRS,
		);
		expect(res).not.toBeNull();
	});

	test("matches case-insensitively", () => {
		const res = buildResponseForQuery(
			buildQuery("DEVICESDK.LOCAL", TYPE_A),
			"devicesdk.local",
			ADDRS,
		);
		expect(res).not.toBeNull();
	});

	test("ignores queries for other names", () => {
		const res = buildResponseForQuery(
			buildQuery("other.local", TYPE_A),
			"devicesdk.local",
			ADDRS,
		);
		expect(res).toBeNull();
	});

	test("ignores non-A/ANY question types (e.g. AAAA)", () => {
		const res = buildResponseForQuery(
			buildQuery("devicesdk.local", 28 /* AAAA */),
			"devicesdk.local",
			ADDRS,
		);
		expect(res).toBeNull();
	});

	test("ignores responses (QR set)", () => {
		const query = buildQuery("devicesdk.local", TYPE_A);
		new DataView(query.buffer).setUint16(2, 0x8400); // mark as response
		expect(buildResponseForQuery(query, "devicesdk.local", ADDRS)).toBeNull();
	});

	test("returns null when there are no addresses", () => {
		const res = buildResponseForQuery(
			buildQuery("devicesdk.local", TYPE_A),
			"devicesdk.local",
			[],
		);
		expect(res).toBeNull();
	});

	test("returns null on a malformed packet", () => {
		expect(
			buildResponseForQuery(new Uint8Array(3), "devicesdk.local", ADDRS),
		).toBeNull();
	});
});

describe("localIpv4Addresses", () => {
	test("returns dotted-quad strings without loopback", () => {
		for (const addr of localIpv4Addresses()) {
			expect(addr).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
			expect(addr).not.toBe("127.0.0.1");
		}
	});
});

describe("startMdnsResponder (socket)", () => {
	let responder: MdnsResponder | undefined;
	let client: dgram.Socket | undefined;

	afterEach(() => {
		responder?.stop();
		responder = undefined;
		client?.close();
		client = undefined;
	});

	test("replies unicast to a query on a fixed test port", async () => {
		// Bind a known port and a fixed test address so the result does not
		// depend on the host's real interfaces or multicast delivery - we send
		// the query unicast straight at the responder.
		const PORT = 53531;
		responder = startMdnsResponder({
			hostname: "devicesdk",
			port: PORT,
			getAddresses: () => ["192.168.1.42"],
		});

		client = dgram.createSocket({ type: "udp4", reuseAddr: true });
		const got = new Promise<Uint8Array>((resolve) => {
			client?.on("message", (msg) => resolve(new Uint8Array(msg)));
		});
		await new Promise<void>((resolve) => client?.bind(0, resolve));

		const query = buildQuery("devicesdk.local", TYPE_A);
		client.send(query, PORT, "127.0.0.1");

		const reply = await Promise.race([
			got,
			new Promise<null>((r) => setTimeout(() => r(null), 2000)),
		]);
		expect(reply).not.toBeNull();
		const parsed = parseQuery(reply as Uint8Array);
		// It's a response with an answer; our parser reads the header bits.
		expect(parsed?.isResponse).toBe(true);
		const view = new DataView((reply as Uint8Array).buffer);
		expect(view.getUint16(6)).toBe(1); // one A answer
	});
});

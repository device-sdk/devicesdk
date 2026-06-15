import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverMdnsHost, parseAResponses } from "./mdnsDiscovery.js";

const TYPE_A = 1;
const CLASS_IN = 1;

function encodeName(name: string): Uint8Array {
	const labels = name.split(".").filter((label) => label.length > 0);
	let size = 1;
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

function buildARecordResponse(name: string, ip: string): Uint8Array {
	const nameBytes = encodeName(name);
	const octets = ip.split(".").map(Number);
	const buf = new Uint8Array(12 + nameBytes.length + 2 + 2 + 4 + 2 + 4);
	const view = new DataView(buf.buffer);
	view.setUint16(0, 0); // ID
	view.setUint16(2, 0x8400); // QR=1, AA=1
	view.setUint16(4, 0); // QDCOUNT
	view.setUint16(6, 1); // ANCOUNT
	view.setUint16(8, 0); // NSCOUNT
	view.setUint16(10, 0); // ARCOUNT
	let offset = 12;
	buf.set(nameBytes, offset);
	offset += nameBytes.length;
	view.setUint16(offset, TYPE_A);
	offset += 2;
	view.setUint16(offset, CLASS_IN | 0x8000); // cache-flush
	offset += 2;
	view.setUint32(offset, 120); // TTL
	offset += 4;
	view.setUint16(offset, 4); // RDLENGTH
	offset += 2;
	for (let i = 0; i < 4; i++) {
		buf[offset++] = octets[i];
	}
	return buf;
}

function buildQueryPacket(): Uint8Array {
	// Not used by parseAResponses directly, but useful for tests that need a
	// query-shaped packet.
	const nameBytes = encodeName("devicesdk.local");
	const buf = new Uint8Array(12 + nameBytes.length + 4);
	const view = new DataView(buf.buffer);
	view.setUint16(2, 0); // query, not response
	view.setUint16(4, 1); // QDCOUNT
	let offset = 12;
	buf.set(nameBytes, offset);
	offset += nameBytes.length;
	view.setUint16(offset, TYPE_A);
	view.setUint16(offset + 2, CLASS_IN);
	return buf;
}

describe("parseAResponses", () => {
	it("returns an empty array for packets too short to be DNS", () => {
		expect(parseAResponses(new Uint8Array(10), "devicesdk.local")).toEqual([]);
	});

	it("ignores query packets", () => {
		expect(parseAResponses(buildQueryPacket(), "devicesdk.local")).toEqual([]);
	});

	it("extracts a matching A record", () => {
		const response = buildARecordResponse("devicesdk.local", "192.168.1.42");
		expect(parseAResponses(response, "devicesdk.local")).toEqual([
			"192.168.1.42",
		]);
	});

	it("is case-insensitive for the owner name", () => {
		const response = buildARecordResponse("DeviceSDK.local", "192.168.1.42");
		expect(parseAResponses(response, "devicesdk.local")).toEqual([
			"192.168.1.42",
		]);
	});

	it("skips records that do not match the target name", () => {
		const response = buildARecordResponse("other.local", "192.168.1.42");
		expect(parseAResponses(response, "devicesdk.local")).toEqual([]);
	});
});

describe("discoverMdnsHost", () => {
	const originalEnv = { ...process.env };
	let socketEmitter: EventEmitter & {
		bind: () => typeof socketEmitter;
		send: (
			_msg: unknown,
			_port: unknown,
			_address: unknown,
			callback?: (err: Error | null) => void,
		) => typeof socketEmitter;
		close: () => typeof socketEmitter;
		addMembership: () => void;
	};

	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		process.env = { ...originalEnv };
		delete process.env.DEVICESDK_MDNS_HOSTNAME;
		delete process.env.DEVICESDK_MDNS_PORT;

		vi.spyOn(dgram, "createSocket").mockImplementation((() => {
			const emitter = new EventEmitter();
			socketEmitter = Object.assign(emitter, {
				bind() {
					process.nextTick(() => emitter.emit("listening"));
					return socketEmitter;
				},
				send(
					_msg: unknown,
					_port: unknown,
					_address: unknown,
					callback?: (err: Error | null) => void,
				) {
					process.nextTick(() => callback?.(null));
					return socketEmitter;
				},
				close() {
					return socketEmitter;
				},
				addMembership() {
					/* no-op */
				},
			});
			return socketEmitter;
		}) as unknown as typeof dgram.createSocket);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		process.env = originalEnv;
	});

	it("resolves to a URL built from the first A-record response", async () => {
		const promise = discoverMdnsHost({ timeoutMs: 1000 });

		// Wait for the socket to be "listening" and the query sent.
		await vi.advanceTimersByTimeAsync(10);

		socketEmitter.emit(
			"message",
			buildARecordResponse("devicesdk.local", "192.168.1.100"),
		);

		await expect(promise).resolves.toBe("http://192.168.1.100:8080");
	});

	it("honours DEVICESDK_MDNS_HOSTNAME and DEVICESDK_MDNS_PORT", async () => {
		process.env.DEVICESDK_MDNS_HOSTNAME = "myserver";
		process.env.DEVICESDK_MDNS_PORT = "9000";

		const promise = discoverMdnsHost({ timeoutMs: 1000 });
		await vi.advanceTimersByTimeAsync(10);

		socketEmitter.emit(
			"message",
			buildARecordResponse("myserver.local", "10.0.0.5"),
		);

		await expect(promise).resolves.toBe("http://10.0.0.5:9000");
	});

	it("returns null when no response arrives before the timeout", async () => {
		const promise = discoverMdnsHost({ timeoutMs: 500 });
		await vi.advanceTimersByTimeAsync(10);
		await vi.advanceTimersByTimeAsync(600);
		await expect(promise).resolves.toBeNull();
	});
});

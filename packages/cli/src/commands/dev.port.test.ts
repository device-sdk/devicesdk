import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isPortAvailable, parseDevPort, probePort } from "./dev";

describe("dev command port selection", () => {
	const servers: net.Server[] = [];

	afterEach(() => {
		for (const server of servers) {
			server.close();
		}
		servers.length = 0;
	});

	it("should detect a port as available when nothing is listening", async () => {
		// Use port 0 to get a random available port, then check a known-free port
		const server = net.createServer();
		servers.push(server);
		await new Promise<void>((resolve) => {
			server.listen(0, () => resolve());
		});
		const addr = server.address() as net.AddressInfo;
		server.close();

		// After closing, the port should be available
		await new Promise((resolve) => setTimeout(resolve, 50));
		const available = await isPortAvailable(addr.port);
		expect(available).toBe(true);
	});

	it("should detect a port as unavailable when something is listening", async () => {
		const server = net.createServer();
		servers.push(server);
		await new Promise<void>((resolve) => {
			server.listen(0, () => resolve());
		});
		const addr = server.address() as net.AddressInfo;

		const available = await isPortAvailable(addr.port);
		expect(available).toBe(false);
	});

	it("probePort reports an in-use port as in_use", async () => {
		const server = net.createServer();
		servers.push(server);
		await new Promise<void>((resolve) => {
			server.listen(0, () => resolve());
		});
		const addr = server.address() as net.AddressInfo;

		expect(await probePort(addr.port)).toBe("in_use");
	});

	it("probePort reports a free port as available", async () => {
		const server = net.createServer();
		servers.push(server);
		await new Promise<void>((resolve) => {
			server.listen(0, () => resolve());
		});
		const addr = server.address() as net.AddressInfo;
		server.close();
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(await probePort(addr.port)).toBe("available");
	});

	it("parseDevPort accepts valid ports and the default", () => {
		expect(parseDevPort(undefined)).toBe(8181);
		expect(parseDevPort("3000")).toBe(3000);
		expect(parseDevPort("1")).toBe(1);
		expect(parseDevPort("65535")).toBe(65535);
	});

	it("parseDevPort rejects non-integer and out-of-range values", () => {
		expect(Number.isNaN(parseDevPort("abc"))).toBe(true);
		expect(Number.isNaN(parseDevPort("12.5"))).toBe(true);
		expect(Number.isNaN(parseDevPort("0"))).toBe(true);
		expect(Number.isNaN(parseDevPort("65536"))).toBe(true);
		expect(Number.isNaN(parseDevPort(""))).toBe(true);
	});
});

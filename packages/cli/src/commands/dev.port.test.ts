import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { isPortAvailable } from "./dev";

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
});

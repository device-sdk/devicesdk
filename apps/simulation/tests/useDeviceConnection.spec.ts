import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useDeviceConnection } from "../src/composables/useDeviceConnection";

// FakeWebSocket lets the tests drive open/close/error/message lifecycles
// synchronously. Each `connect` call constructs one - after a close the
// composable nulls the reference, so reconnects produce fresh instances.
class FakeWebSocket {
	static OPEN = 1;
	static instances: FakeWebSocket[] = [];
	static reset() {
		FakeWebSocket.instances = [];
	}

	url: string;
	readyState = 0;
	onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
	onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
	onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
	onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
	sent: string[] = [];
	closeCalls = 0;

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	send(payload: string) {
		this.sent.push(payload);
	}

	close() {
		this.closeCalls += 1;
		this.readyState = 3;
		this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
	}

	emitOpen() {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.call(this as unknown as WebSocket, {} as Event);
	}

	emitClose() {
		this.readyState = 3;
		this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
	}
}

describe("useDeviceConnection", () => {
	beforeEach(() => {
		FakeWebSocket.reset();
		vi.stubGlobal("WebSocket", FakeWebSocket);
		vi.stubGlobal("window", {
			location: { protocol: "http:", host: "localhost:9002" },
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("opens a single socket on connect()", () => {
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);
			expect(FakeWebSocket.instances).toHaveLength(1);
			expect(FakeWebSocket.instances[0]?.url).toBe(
				"ws://localhost:9002/ws/dev-1",
			);
			expect(conn.status.value).toBe("connecting");
			FakeWebSocket.instances[0]?.emitOpen();
			expect(conn.status.value).toBe("connected");
			expect(conn.reconnecting.value).toBe(false);
		});
		scope.stop();
	});

	it("reconnects with exponential backoff after an unintended close", () => {
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);
			FakeWebSocket.instances[0]?.emitOpen();

			// First unintended drop - banner shows, reconnect scheduled at 1s.
			FakeWebSocket.instances[0]?.emitClose();
			expect(conn.reconnecting.value).toBe(true);
			expect(FakeWebSocket.instances).toHaveLength(1);

			vi.advanceTimersByTime(999);
			expect(FakeWebSocket.instances).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(FakeWebSocket.instances).toHaveLength(2);

			// Second drop without a successful onopen between → next backoff is 2s.
			FakeWebSocket.instances[1]?.emitClose();
			vi.advanceTimersByTime(1999);
			expect(FakeWebSocket.instances).toHaveLength(2);
			vi.advanceTimersByTime(1);
			expect(FakeWebSocket.instances).toHaveLength(3);

			// Third drop → 4s.
			FakeWebSocket.instances[2]?.emitClose();
			vi.advanceTimersByTime(3999);
			expect(FakeWebSocket.instances).toHaveLength(3);
			vi.advanceTimersByTime(1);
			expect(FakeWebSocket.instances).toHaveLength(4);
		});
		scope.stop();
	});

	it("resets the backoff after a successful reconnect", () => {
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);

			// Close, reconnect at 1s, succeed. Backoff should reset.
			FakeWebSocket.instances[0]?.emitClose();
			vi.advanceTimersByTime(1000);
			expect(FakeWebSocket.instances).toHaveLength(2);
			FakeWebSocket.instances[1]?.emitOpen();
			expect(conn.reconnecting.value).toBe(false);

			// Drop again - should schedule at 1s, not 2s.
			FakeWebSocket.instances[1]?.emitClose();
			vi.advanceTimersByTime(999);
			expect(FakeWebSocket.instances).toHaveLength(2);
			vi.advanceTimersByTime(1);
			expect(FakeWebSocket.instances).toHaveLength(3);
		});
		scope.stop();
	});

	it("caps the backoff at 30s", () => {
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);

			// Force the backoff to ramp past 30s. Each cycle: emitClose, advance.
			let expected = 1_000;
			for (let i = 0; i < 8; i += 1) {
				FakeWebSocket.instances[i]?.emitClose();
				vi.advanceTimersByTime(expected);
				expected = Math.min(expected * 2, 30_000);
			}
			// At this point backoff should be capped at 30s.
			const before = FakeWebSocket.instances.length;
			FakeWebSocket.instances[before - 1]?.emitClose();
			vi.advanceTimersByTime(29_999);
			expect(FakeWebSocket.instances).toHaveLength(before);
			vi.advanceTimersByTime(1);
			expect(FakeWebSocket.instances).toHaveLength(before + 1);
		});
		scope.stop();
	});

	it("does NOT reconnect after an explicit disconnect()", () => {
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);
			FakeWebSocket.instances[0]?.emitOpen();

			conn.disconnect();
			expect(conn.reconnecting.value).toBe(false);

			// Even after a long wait nothing new should appear.
			vi.advanceTimersByTime(60_000);
			expect(FakeWebSocket.instances).toHaveLength(1);
			expect(conn.status.value).toBe("disconnected");
		});
		scope.stop();
	});

	it("disconnect() cancels a pending reconnect timer", () => {
		// `onUnmounted` calls `disconnect()`, so verifying that disconnect
		// clears a scheduled reconnect is sufficient to prove the unmount
		// path doesn't leave a dangling timer.
		const scope = effectScope();
		scope.run(() => {
			const conn = useDeviceConnection();
			conn.connect("dev-1", () => null);
			FakeWebSocket.instances[0]?.emitClose();
			expect(conn.reconnecting.value).toBe(true);

			conn.disconnect();
			vi.advanceTimersByTime(60_000);
			expect(FakeWebSocket.instances).toHaveLength(1);
			expect(conn.reconnecting.value).toBe(false);
		});
		scope.stop();
	});
});

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

interface Frame {
	event: string;
	data?: { id: string; level: string; message: string; created_at: number };
	replay?: boolean;
}

function getDevice(id: string) {
	const doId = env.TEST_DEVICE.idFromName(id);
	return env.TEST_DEVICE.get(doId) as unknown as {
		testSeedLogs(
			entries: Array<{ id: string; level: string; message: string }>,
		): Promise<void>;
		testHandleWatcherUpgrade(query: string): Promise<{ frames: Frame[] }>;
	};
}

describe("Watcher WS backfill", () => {
	it("emits no replay frames when backfillLimit is not provided (back-compat)", async () => {
		const stub = getDevice("watch-backfill-none");
		await stub.testSeedLogs([
			{ id: "a", level: "info", message: "first" },
			{ id: "b", level: "info", message: "second" },
		]);

		const { frames } = await stub.testHandleWatcherUpgrade("");

		// Only the initial status frame is sent — no replay, no history_complete.
		expect(frames.find((f) => f.event === "status")).toBeDefined();
		expect(frames.find((f) => f.replay === true)).toBeUndefined();
		expect(frames.find((f) => f.event === "history_complete")).toBeUndefined();
	});

	it("replays up to backfillLimit logs oldest-first, then sends history_complete", async () => {
		const stub = getDevice("watch-backfill-basic");
		await stub.testSeedLogs([
			{ id: "a", level: "info", message: "first" },
			{ id: "b", level: "warn", message: "second" },
			{ id: "c", level: "error", message: "third" },
		]);

		const { frames } = await stub.testHandleWatcherUpgrade("?backfillLimit=10");

		const replays = frames.filter((f) => f.replay === true);
		expect(replays.length).toBe(3);
		// Oldest first.
		expect(replays[0].data?.message).toBe("first");
		expect(replays[1].data?.message).toBe("second");
		expect(replays[2].data?.message).toBe("third");

		const completeIdx = frames.findIndex((f) => f.event === "history_complete");
		expect(completeIdx).toBeGreaterThan(-1);
		// history_complete must come AFTER all replays.
		const lastReplayIdx = frames.lastIndexOf(replays[replays.length - 1]);
		expect(completeIdx).toBeGreaterThan(lastReplayIdx);
	});

	it("filters by backfillLevel", async () => {
		const stub = getDevice("watch-backfill-level");
		await stub.testSeedLogs([
			{ id: "a", level: "info", message: "info-1" },
			{ id: "b", level: "error", message: "err-1" },
			{ id: "c", level: "info", message: "info-2" },
			{ id: "d", level: "error", message: "err-2" },
		]);

		const { frames } = await stub.testHandleWatcherUpgrade(
			"?backfillLimit=10&backfillLevel=error",
		);

		const replays = frames.filter((f) => f.replay === true);
		expect(replays.length).toBe(2);
		expect(replays.every((f) => f.data?.level === "error")).toBe(true);
	});

	it("clamps backfillLimit to 100", async () => {
		const stub = getDevice("watch-backfill-clamp");
		const entries = Array.from({ length: 120 }, (_, i) => ({
			id: `id-${i.toString().padStart(3, "0")}`,
			level: "info",
			message: `msg ${i}`,
		}));
		await stub.testSeedLogs(entries);

		const { frames } =
			await stub.testHandleWatcherUpgrade("?backfillLimit=999");

		const replays = frames.filter((f) => f.replay === true);
		expect(replays.length).toBe(100);
	});

	it("ignores invalid backfillLimit values", async () => {
		const stub = getDevice("watch-backfill-invalid");
		await stub.testSeedLogs([{ id: "a", level: "info", message: "x" }]);

		const { frames } = await stub.testHandleWatcherUpgrade(
			"?backfillLimit=not-a-number",
		);

		// Treated like 0/missing — no replay, no history_complete.
		expect(frames.find((f) => f.replay === true)).toBeUndefined();
		expect(frames.find((f) => f.event === "history_complete")).toBeUndefined();
	});
});

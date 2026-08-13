import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import esp32Manifest from "@devicesdk/firmware-esp32/package.json";
import picoManifest from "@devicesdk/firmware-pico/package.json";
import { FsBlobStore } from "../storage/fsBlobStore";
import { syncFirmware } from "./firmwareSync";

const ESP32_ASSETS = [
	"esp32-client.bin",
	"esp32c61-client.bin",
	"esp32c3-client.bin",
];
const PICO_ASSETS = [
	"devicesdk-pico-w-client.uf2",
	"devicesdk-pico2-w-client.uf2",
];
const OK_BODY = new Uint8Array([1, 2, 3]);

const originalFetch = globalThis.fetch;

describe("syncFirmware", () => {
	let dir: string;
	let store: FsBlobStore;
	const logs: string[] = [];
	const fetchMock = mock(() => new Response(OK_BODY));

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "firmware-sync-"));
		store = new FsBlobStore(dir);
		logs.length = 0;
		fetchMock.mockClear();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		rmSync(dir, { recursive: true, force: true });
	});

	test("downloads the pinned release when the store is empty", async () => {
		await syncFirmware(store, (m) => logs.push(m));

		for (const asset of ESP32_ASSETS) {
			expect(fetchMock).toHaveBeenCalledWith(
				`https://github.com/device-sdk/devicesdk/releases/download/firmware-esp32@v${esp32Manifest.version}/${asset}`,
				expect.any(Object),
			);
			expect((await store.get(asset))?.size).toBe(OK_BODY.byteLength);
		}
		for (const asset of PICO_ASSETS) {
			expect(fetchMock).toHaveBeenCalledWith(
				`https://github.com/device-sdk/devicesdk/releases/download/firmware-pico@v${picoManifest.version}/${asset}`,
				expect.any(Object),
			);
			expect((await store.get(asset))?.size).toBe(OK_BODY.byteLength);
		}
		const espMarker = await store.get(".version-esp32");
		const picoMarker = await store.get(".version-pico");
		expect(espMarker).not.toBeNull();
		expect(picoMarker).not.toBeNull();
		expect(await espMarker?.text()).toBe(esp32Manifest.version);
		expect(await picoMarker?.text()).toBe(picoManifest.version);
	});

	test("skips families already at the pinned version", async () => {
		await syncFirmware(store, (m) => logs.push(m));
		const callsAfterFirstSync = fetchMock.mock.calls.length;
		expect(callsAfterFirstSync).toBe(ESP32_ASSETS.length + PICO_ASSETS.length);

		await syncFirmware(store, (m) => logs.push(m));
		expect(fetchMock.mock.calls.length).toBe(callsAfterFirstSync);
		expect(logs.some((m) => m.includes("already synced"))).toBe(true);
	});

	test("re-downloads when the stored version differs", async () => {
		await store.put(".version-esp32", "0.0.0");
		await syncFirmware(store, () => {});

		expect(fetchMock.mock.calls.length).toBe(
			ESP32_ASSETS.length + PICO_ASSETS.length,
		);
		const marker = await store.get(".version-esp32");
		expect(await marker?.text()).toBe(esp32Manifest.version);
	});

	test("keeps existing binaries and does not throw when a download fails", async () => {
		globalThis.fetch = mock((url: string | URL | Request) =>
			String(url).endsWith("esp32-client.bin")
				? new Response("missing", { status: 404 })
				: new Response(OK_BODY),
		) as unknown as typeof fetch;

		await expect(
			syncFirmware(store, (m) => logs.push(m)),
		).resolves.toBeUndefined();

		expect(await store.get(".version-esp32")).toBeNull();
		expect(await store.get("esp32-client.bin")).toBeNull();
		expect(logs.some((m) => m.includes("sync failed"))).toBe(true);
	});
});

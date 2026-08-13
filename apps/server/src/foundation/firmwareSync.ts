import esp32Manifest from "@devicesdk/firmware-esp32/package.json";
import picoManifest from "@devicesdk/firmware-pico/package.json";
import type { FsBlobStore } from "../storage/fsBlobStore";

const FIRMWARE_REPO = "device-sdk/devicesdk";

const FAMILIES = [
	{
		family: "esp32",
		version: esp32Manifest.version,
		assets: ["esp32-client.bin", "esp32c61-client.bin", "esp32c3-client.bin"],
	},
	{
		family: "pico",
		version: picoManifest.version,
		assets: ["devicesdk-pico-w-client.uf2", "devicesdk-pico2-w-client.uf2"],
	},
];

function markerKey(family: string): string {
	return `.version-${family}`;
}

/**
 * Fetch the exact firmware release version this server was built against (the
 * version pinned by the @devicesdk/firmware-* workspace dependencies) into the
 * firmware store. A freshly built image therefore serves the firmware release
 * it shipped with instead of whatever is newest when the container starts.
 * Best-effort: failures are logged and never crash boot, and a partial
 * download leaves the previous binaries untouched (all-or-nothing per family).
 */
export async function syncFirmware(
	store: FsBlobStore,
	log: (message: string) => void,
): Promise<void> {
	await Promise.all(
		FAMILIES.map(async ({ family, version, assets }) => {
			const marker = markerKey(family);
			const existing = await store.get(marker);
			const current = existing ? await existing.text() : "";
			if (current === version) {
				log(`firmware ${family}@${version} already synced`);
				return;
			}
			try {
				const downloaded = await Promise.all(
					assets.map(async (asset) => {
						const res = await fetch(
							`https://github.com/${FIRMWARE_REPO}/releases/download/firmware-${family}@v${version}/${asset}`,
							{ signal: AbortSignal.timeout(30_000) },
						);
						if (!res.ok) {
							throw new Error(`HTTP ${res.status} for ${asset}`);
						}
						return [asset, await res.arrayBuffer()] as const;
					}),
				);
				for (const [asset, buffer] of downloaded) {
					await store.put(asset, buffer);
				}
				await store.put(marker, version);
				log(
					`firmware ${family}@${version} synced (${downloaded.length} assets)`,
				);
			} catch (err) {
				log(
					`firmware ${family}@${version} sync failed: ${(err as Error).message}`,
				);
			}
		}),
	);
}

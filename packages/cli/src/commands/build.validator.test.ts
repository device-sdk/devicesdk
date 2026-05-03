import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDevice } from "./build.js";

// These tests exercise the named-export validator in `buildDevice` with real
// esbuild runs against scratch files on disk. The validator is the entire
// reason for the metafile-driven export check, so a mock-based test would
// only assert what we're testing.
describe("buildDevice — named-export validator", () => {
	let tmpRoot: string;
	let entryFile: string;
	let outDir: string;

	beforeEach(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devicesdk-build-test-"));
		entryFile = path.join(tmpRoot, "entry.ts");
		outDir = path.join(tmpRoot, "out");
		await fs.mkdir(outDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	});

	it("rejects an entry that uses `export default class` with a tailored hint", async () => {
		await fs.writeFile(
			entryFile,
			"export default class DoorSensor { onMessage() {} }\n",
		);

		await expect(
			buildDevice("door", entryFile, "DoorSensor", outDir, {}),
		).rejects.toThrow(
			/Class "DoorSensor" must be exported as a named export.*Found a default export.*export default class DoorSensor.*export class DoorSensor/s,
		);
	});

	it("rejects an entry that has neither default nor matching named export", async () => {
		await fs.writeFile(entryFile, "export class Other { onMessage() {} }\n");

		await expect(
			buildDevice("door", entryFile, "DoorSensor", outDir, {}),
		).rejects.toThrow(
			/Class "DoorSensor" must be exported as a named export.*Add a named export/s,
		);
	});

	it("succeeds when the entry exports the configured class as a named export", async () => {
		await fs.writeFile(
			entryFile,
			"export class DoorSensor { onMessage() {} }\n",
		);

		const result = await buildDevice(
			"door",
			entryFile,
			"DoorSensor",
			outDir,
			{},
		);
		expect(result.size).toBeGreaterThan(0);
		expect(result.outfile).toBe(path.join(outDir, "door.js"));
	});
});

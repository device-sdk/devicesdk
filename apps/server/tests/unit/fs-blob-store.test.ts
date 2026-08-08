import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsBlobStore } from "../../src/storage/fsBlobStore";

describe("FsBlobStore", () => {
	let dir: string;
	let store: FsBlobStore;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "dsdk-blob-"));
		store = new FsBlobStore(dir);
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	test("put then get round-trips content", async () => {
		await store.put("a/b/c.js", "console.log(1)");
		const obj = await store.get("a/b/c.js");
		expect(obj).not.toBeNull();
		expect(await obj?.text()).toBe("console.log(1)");
	});

	test("put overwrites atomically and leaves no .tmp files", async () => {
		await store.put("a/latest.js", "v1");
		await store.put("a/latest.js", "v2");
		expect(await (await store.get("a/latest.js"))?.text()).toBe("v2");
		const list = await store.list({ prefix: "a/" });
		expect(list.objects.map((o) => o.key)).toEqual(["a/latest.js"]);
	});

	test("rejects keys that traverse outside the root", async () => {
		await expect(store.put("../escape.js", "x")).rejects.toThrow(
			/Invalid blob key/,
		);
	});

	test("delete removes the object", async () => {
		await store.put("a.js", "x");
		await store.delete("a.js");
		expect(await store.get("a.js")).toBeNull();
	});
});

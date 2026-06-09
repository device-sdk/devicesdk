import { mkdirSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export interface BlobObject {
	key: string;
	size: number;
	text(): Promise<string>;
	arrayBuffer(): Promise<ArrayBuffer>;
	json<T = unknown>(): Promise<T>;
	body: ReadableStream<Uint8Array>;
}

export interface BlobListResult {
	objects: { key: string; size: number }[];
	truncated: boolean;
	cursor?: string;
}

/**
 * Filesystem-backed blob store implementing the R2Bucket subset the API uses
 * (get / put / delete / list-with-prefix-and-cursor). Keys keep the exact R2
 * layout (`{userId}/{projectId}/{deviceId}/{versionId}.js`) as relative paths
 * under the root directory.
 */
export class FsBlobStore {
	private root: string;

	constructor(root: string) {
		this.root = resolve(root);
		mkdirSync(this.root, { recursive: true });
	}

	/** Resolves a key to an absolute path, rejecting traversal outside root. */
	private pathFor(key: string): string {
		const abs = resolve(this.root, key);
		if (abs !== this.root && !abs.startsWith(this.root + sep)) {
			throw new Error(`Invalid blob key: ${key}`);
		}
		return abs;
	}

	async get(key: string): Promise<BlobObject | null> {
		const path = this.pathFor(key);
		const file = Bun.file(path);
		if (!(await file.exists())) return null;
		return {
			key,
			size: file.size,
			text: () => file.text(),
			arrayBuffer: () => file.arrayBuffer(),
			json: <T = unknown>() => file.json() as Promise<T>,
			body: file.stream(),
		};
	}

	async put(
		key: string,
		value: string | ArrayBuffer | ArrayBufferView | Uint8Array,
	): Promise<void> {
		const path = this.pathFor(key);
		await mkdir(dirname(path), { recursive: true });
		if (typeof value === "string") {
			await writeFile(path, value, "utf-8");
		} else if (value instanceof ArrayBuffer) {
			await writeFile(path, new Uint8Array(value));
		} else {
			await writeFile(
				path,
				new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
			);
		}
	}

	async delete(key: string): Promise<void> {
		await rm(this.pathFor(key), { force: true });
	}

	async list(options?: {
		prefix?: string;
		cursor?: string;
		limit?: number;
	}): Promise<BlobListResult> {
		const prefix = options?.prefix ?? "";
		const limit = options?.limit ?? 1000;
		const offset = options?.cursor ? Number.parseInt(options.cursor, 10) : 0;

		const keys = (await this.walk(this.root)).filter((k) =>
			k.startsWith(prefix),
		);
		keys.sort();

		const page = keys.slice(offset, offset + limit);
		const objects = await Promise.all(
			page.map(async (key) => ({
				key,
				size: (await stat(this.pathFor(key))).size,
			})),
		);
		const truncated = offset + limit < keys.length;
		return {
			objects,
			truncated,
			cursor: truncated ? String(offset + limit) : undefined,
		};
	}

	private async walk(dir: string): Promise<string[]> {
		let entries: import("node:fs").Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return [];
		}
		const out: string[] = [];
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				out.push(...(await this.walk(full)));
			} else if (entry.isFile()) {
				out.push(relative(this.root, full).split(sep).join("/"));
			}
		}
		return out;
	}
}

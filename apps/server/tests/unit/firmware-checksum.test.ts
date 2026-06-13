import { describe, expect, test } from "bun:test";
import { recalculateEsp32Checksum } from "../../src/foundation/esp32ImageChecksum";
import { validateUf2Structure } from "../../src/foundation/picoUf2Checksum";

const APP_OFFSET = 0x10000;
const HEADER_SIZE = 24;
const ESP_IMAGE_MAGIC = 0xe9;
const CHECKSUM_INIT = 0xef;

/**
 * Build a minimal-but-valid ESP-IDF merged image:
 *   bytes[0..APP_OFFSET)       arbitrary "bootloader/partition" filler
 *   bytes[APP_OFFSET]          magic 0xE9
 *   bytes[APP_OFFSET+1]        segment_count
 *   bytes[APP_OFFSET+23]       hash_appended flag
 *   then `segmentCount` segments of `[4-byte addr][4-byte len][len bytes data]`
 *   then padding to 16-byte alignment (the last byte is the XOR checksum)
 *   then 32 bytes for the SHA256 if hash_appended.
 */
function buildEsp32Image(opts: {
	segments: number[][]; // each entry is the data bytes for a segment
	hashAppended: boolean;
}): Uint8Array {
	const { segments, hashAppended } = opts;
	// Compute the total image size (from magic byte through checksum byte).
	let imageSize = HEADER_SIZE;
	for (const seg of segments) imageSize += 8 + seg.length;
	const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
	let total = APP_OFFSET + alignedSize;
	if (hashAppended) total += 32;

	const bytes = new Uint8Array(total);
	// Fill the pre-app region with a recognizable pattern.
	for (let i = 0; i < APP_OFFSET; i++) bytes[i] = i & 0xff;

	bytes[APP_OFFSET] = ESP_IMAGE_MAGIC;
	bytes[APP_OFFSET + 1] = segments.length;
	bytes[APP_OFFSET + 23] = hashAppended ? 1 : 0;

	let off = APP_OFFSET + HEADER_SIZE;
	for (const seg of segments) {
		// load_addr (arbitrary)
		bytes[off] = 0x00;
		bytes[off + 1] = 0x00;
		bytes[off + 2] = 0x01;
		bytes[off + 3] = 0x40;
		// data_len little-endian
		const len = seg.length;
		bytes[off + 4] = len & 0xff;
		bytes[off + 5] = (len >> 8) & 0xff;
		bytes[off + 6] = (len >> 16) & 0xff;
		bytes[off + 7] = (len >> 24) & 0xff;
		off += 8;
		for (let i = 0; i < len; i++) bytes[off + i] = seg[i];
		off += len;
	}
	return bytes;
}

/** Independent reference XOR checksum over all segment data bytes. */
function expectedChecksum(segments: number[][]): number {
	let cs = CHECKSUM_INIT;
	for (const seg of segments) for (const b of seg) cs ^= b;
	return cs & 0xff;
}

describe("recalculateEsp32Checksum", () => {
	test("sets the XOR checksum byte at the 16-byte aligned boundary (no hash)", async () => {
		const segments = [
			[1, 2, 3, 4, 5],
			[0xaa, 0xbb, 0xcc],
		];
		const bytes = buildEsp32Image({ segments, hashAppended: false });

		// Pre-corrupt the checksum slot to prove the function actually writes it.
		const imageSize =
			HEADER_SIZE + segments.reduce((a, s) => a + 8 + s.length, 0);
		const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
		const checksumOffset = APP_OFFSET + alignedSize - 1;
		bytes[checksumOffset] = 0x55;

		await recalculateEsp32Checksum(bytes);

		expect(bytes[checksumOffset]).toBe(expectedChecksum(segments));
	});

	test("recomputes the SHA256 trailer when hash_appended=1", async () => {
		const segments = [[10, 20, 30, 40]];
		const bytes = buildEsp32Image({ segments, hashAppended: true });

		const imageSize =
			HEADER_SIZE + segments.reduce((a, s) => a + 8 + s.length, 0);
		const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
		const checksumOffset = APP_OFFSET + alignedSize - 1;
		const hashOffset = checksumOffset + 1;

		await recalculateEsp32Checksum(bytes);

		// Checksum byte correct.
		expect(bytes[checksumOffset]).toBe(expectedChecksum(segments));

		// Independently recompute SHA256 over magic..checksum (inclusive).
		const hashInput = bytes.slice(APP_OFFSET, checksumOffset + 1);
		const digest = new Uint8Array(
			await crypto.subtle.digest("SHA-256", hashInput),
		);
		const written = bytes.slice(hashOffset, hashOffset + 32);
		expect([...written]).toEqual([...digest]);
	});

	test("checksum changes when patched data changes (idempotent recompute)", async () => {
		const segments = [[1, 1, 1, 1]];
		const bytes = buildEsp32Image({ segments, hashAppended: false });
		await recalculateEsp32Checksum(bytes);
		const imageSize = HEADER_SIZE + 8 + 4;
		const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
		const checksumOffset = APP_OFFSET + alignedSize - 1;
		const first = bytes[checksumOffset];

		// Flip a data byte, recompute — checksum must follow.
		const dataStart = APP_OFFSET + HEADER_SIZE + 8;
		bytes[dataStart] ^= 0xff;
		await recalculateEsp32Checksum(bytes);
		expect(bytes[checksumOffset]).toBe(first ^ 0xff);
	});

	test("throws when the buffer is too small to hold the app header", async () => {
		const bytes = new Uint8Array(APP_OFFSET); // exactly APP_OFFSET => <= guard
		await expect(recalculateEsp32Checksum(bytes)).rejects.toThrow(/too small/i);
	});

	test("throws on a bad ESP image magic byte", async () => {
		const bytes = buildEsp32Image({
			segments: [[1, 2, 3]],
			hashAppended: false,
		});
		bytes[APP_OFFSET] = 0x00; // corrupt magic
		await expect(recalculateEsp32Checksum(bytes)).rejects.toThrow(/magic/i);
	});

	test("throws when a segment header runs past the buffer end", async () => {
		const bytes = buildEsp32Image({
			segments: [[1, 2, 3]],
			hashAppended: false,
		});
		// Claim two segments but the buffer only holds one segment's worth.
		bytes[APP_OFFSET + 1] = 5;
		await expect(recalculateEsp32Checksum(bytes)).rejects.toThrow(
			/extends beyond binary/i,
		);
	});
});

// ---------------------------------------------------------------------------
// UF2

const UF2_MAGIC_START0 = 0x0a324655;
const UF2_MAGIC_START1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_BLOCK_SIZE = 512;

/** Build `blockCount` well-formed UF2 blocks. */
function buildUf2(blockCount: number): Uint8Array {
	const bytes = new Uint8Array(blockCount * UF2_BLOCK_SIZE);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < blockCount; i++) {
		const off = i * UF2_BLOCK_SIZE;
		view.setUint32(off, UF2_MAGIC_START0, true);
		view.setUint32(off + 4, UF2_MAGIC_START1, true);
		view.setUint32(off + 8, 0x00002000, true); // flags (familyID present)
		view.setUint32(off + 12, 0x10000000 + i * 256, true); // target addr
		view.setUint32(off + 16, 256, true); // payload size
		view.setUint32(off + 20, i, true); // block number
		view.setUint32(off + 24, blockCount, true); // total blocks
		view.setUint32(off + 28, 0xe48bff56, true); // RP2040 familyID
		view.setUint32(off + UF2_BLOCK_SIZE - 4, UF2_MAGIC_END, true);
	}
	return bytes;
}

describe("validateUf2Structure", () => {
	test("accepts a well-formed single-block file", () => {
		expect(() => validateUf2Structure(buildUf2(1))).not.toThrow();
	});

	test("accepts a well-formed multi-block file", () => {
		expect(() => validateUf2Structure(buildUf2(4))).not.toThrow();
	});

	test("throws on an empty buffer", () => {
		expect(() => validateUf2Structure(new Uint8Array(0))).toThrow(/empty/i);
	});

	test("throws when length is not a multiple of the block size", () => {
		expect(() => validateUf2Structure(new Uint8Array(600))).toThrow(
			/not a multiple/i,
		);
	});

	test("throws on a bad start magic 0", () => {
		const bytes = buildUf2(1);
		new DataView(bytes.buffer).setUint32(0, 0xdeadbeef, true);
		expect(() => validateUf2Structure(bytes)).toThrow(/start magic 0/i);
	});

	test("throws on a bad start magic 1", () => {
		const bytes = buildUf2(1);
		new DataView(bytes.buffer).setUint32(4, 0xdeadbeef, true);
		expect(() => validateUf2Structure(bytes)).toThrow(/start magic 1/i);
	});

	test("throws on a bad end magic", () => {
		const bytes = buildUf2(1);
		new DataView(bytes.buffer).setUint32(UF2_BLOCK_SIZE - 4, 0xdeadbeef, true);
		expect(() => validateUf2Structure(bytes)).toThrow(/end magic/i);
	});

	test("throws on a block-number mismatch", () => {
		const bytes = buildUf2(2);
		// Corrupt the second block's blockNo.
		new DataView(bytes.buffer).setUint32(UF2_BLOCK_SIZE + 20, 99, true);
		expect(() => validateUf2Structure(bytes)).toThrow(/block number mismatch/i);
	});

	test("throws on a total-blocks mismatch", () => {
		const bytes = buildUf2(2);
		new DataView(bytes.buffer).setUint32(24, 7, true);
		expect(() => validateUf2Structure(bytes)).toThrow(/total blocks mismatch/i);
	});
});

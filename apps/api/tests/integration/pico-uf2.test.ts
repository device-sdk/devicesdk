import { describe, expect, it } from "vitest";
import { validateUf2Structure } from "../../src/foundation/picoUf2Checksum";

const BLOCK_SIZE = 512;

/**
 * Build a synthetic UF2 file with the given number of blocks.
 * Each block has correct magic numbers, block numbering, and total count.
 */
function buildUf2(blockCount: number): Uint8Array {
	const bytes = new Uint8Array(blockCount * BLOCK_SIZE);
	const view = new DataView(bytes.buffer);

	for (let i = 0; i < blockCount; i++) {
		const offset = i * BLOCK_SIZE;
		view.setUint32(offset, 0x0a324655, true); // magic start 0
		view.setUint32(offset + 4, 0x9e5d5157, true); // magic start 1
		view.setUint32(offset + 8, 0x00002000, true); // flags
		view.setUint32(offset + 12, 0x10000000 + i * 256, true); // target address
		view.setUint32(offset + 16, 256, true); // payload size
		view.setUint32(offset + 20, i, true); // block number
		view.setUint32(offset + 24, blockCount, true); // total blocks
		view.setUint32(offset + 28, 0xe48bff56, true); // family ID (RP2040)
		// data payload (bytes 32-507) left as zeros
		view.setUint32(offset + BLOCK_SIZE - 4, 0x0ab16f30, true); // magic end
	}

	return bytes;
}

describe("validateUf2Structure", () => {
	it("should accept a valid single-block UF2 file", () => {
		const uf2 = buildUf2(1);
		expect(() => validateUf2Structure(uf2)).not.toThrow();
	});

	it("should accept a valid multi-block UF2 file", () => {
		const uf2 = buildUf2(10);
		expect(() => validateUf2Structure(uf2)).not.toThrow();
	});

	it("should reject an empty file", () => {
		expect(() => validateUf2Structure(new Uint8Array(0))).toThrow(
			"UF2 file is empty",
		);
	});

	it("should reject a file not a multiple of 512 bytes", () => {
		expect(() => validateUf2Structure(new Uint8Array(513))).toThrow(
			"not a multiple of 512",
		);
		expect(() => validateUf2Structure(new Uint8Array(100))).toThrow(
			"not a multiple of 512",
		);
	});

	it("should reject corrupted start magic 0", () => {
		const uf2 = buildUf2(2);
		const view = new DataView(uf2.buffer);
		// Corrupt magic0 of block 1
		view.setUint32(BLOCK_SIZE, 0xdeadbeef, true);
		expect(() => validateUf2Structure(uf2)).toThrow(
			"UF2 block 1: invalid start magic 0",
		);
	});

	it("should reject corrupted start magic 1", () => {
		const uf2 = buildUf2(1);
		const view = new DataView(uf2.buffer);
		view.setUint32(4, 0x00000000, true);
		expect(() => validateUf2Structure(uf2)).toThrow(
			"UF2 block 0: invalid start magic 1",
		);
	});

	it("should reject corrupted end magic", () => {
		const uf2 = buildUf2(1);
		const view = new DataView(uf2.buffer);
		view.setUint32(BLOCK_SIZE - 4, 0xffffffff, true);
		expect(() => validateUf2Structure(uf2)).toThrow(
			"UF2 block 0: invalid end magic",
		);
	});

	it("should reject wrong block number", () => {
		const uf2 = buildUf2(3);
		const view = new DataView(uf2.buffer);
		// Set block 1's block number to 5 instead of 1
		view.setUint32(BLOCK_SIZE + 20, 5, true);
		expect(() => validateUf2Structure(uf2)).toThrow(
			"UF2 block 1: block number mismatch (expected 1, got 5)",
		);
	});

	it("should reject wrong total blocks count", () => {
		const uf2 = buildUf2(2);
		const view = new DataView(uf2.buffer);
		// Set block 0's total blocks to 99 instead of 2
		view.setUint32(24, 99, true);
		expect(() => validateUf2Structure(uf2)).toThrow(
			"UF2 block 0: total blocks mismatch (expected 2, got 99)",
		);
	});

	it("should still validate after simulated credential patching", () => {
		const uf2 = buildUf2(4);
		// Simulate patching: overwrite some data bytes in block 2 (offset 32-507)
		const patchOffset = 2 * BLOCK_SIZE + 32;
		const credential = new TextEncoder().encode("my-secret-token-12345");
		uf2.set(credential, patchOffset);
		// Validation should still pass since we only changed data, not headers
		expect(() => validateUf2Structure(uf2)).not.toThrow();
	});

	it("should detect if patching accidentally overwrites a magic number", () => {
		const uf2 = buildUf2(2);
		// Simulate a bug where patching overwrites the end magic of block 0
		const endMagicOffset = BLOCK_SIZE - 4;
		uf2[endMagicOffset] = 0x00;
		expect(() => validateUf2Structure(uf2)).toThrow("invalid end magic");
	});
});

import { describe, expect, it } from "vitest";
import { recalculateEsp32Checksum } from "../../src/foundation/esp32ImageChecksum";

const APP_OFFSET = 0x10000;

/**
 * Build a synthetic ESP-IDF merged binary with the given segments.
 * Returns a Uint8Array large enough to hold bootloader area + app image.
 */
function buildImage(
	segments: { loadAddr: number; data: Uint8Array }[],
	options: { hashAppended?: boolean } = {},
): Uint8Array {
	const { hashAppended = false } = options;

	// Calculate image body size (header + segments)
	let bodySize = 24; // header
	for (const seg of segments) {
		bodySize += 8 + seg.data.length; // segment header + data
	}

	// Align to 16 bytes, checksum is last byte of aligned block
	const alignedSize = Math.ceil((bodySize + 1) / 16) * 16;
	const totalImageSize = alignedSize + (hashAppended ? 32 : 0);
	const totalSize = APP_OFFSET + totalImageSize;

	const bytes = new Uint8Array(totalSize);

	// Header at APP_OFFSET
	bytes[APP_OFFSET] = 0xe9; // magic
	bytes[APP_OFFSET + 1] = segments.length; // segment count
	bytes[APP_OFFSET + 23] = hashAppended ? 1 : 0; // hash_appended

	// Write segments
	let offset = APP_OFFSET + 24;
	for (const seg of segments) {
		// load_addr (little-endian)
		bytes[offset] = seg.loadAddr & 0xff;
		bytes[offset + 1] = (seg.loadAddr >> 8) & 0xff;
		bytes[offset + 2] = (seg.loadAddr >> 16) & 0xff;
		bytes[offset + 3] = (seg.loadAddr >> 24) & 0xff;
		// data_len (little-endian)
		bytes[offset + 4] = seg.data.length & 0xff;
		bytes[offset + 5] = (seg.data.length >> 8) & 0xff;
		bytes[offset + 6] = (seg.data.length >> 16) & 0xff;
		bytes[offset + 7] = (seg.data.length >> 24) & 0xff;
		// data
		bytes.set(seg.data, offset + 8);
		offset += 8 + seg.data.length;
	}

	return bytes;
}

/** Compute expected XOR checksum for segment data bytes. */
function expectedXorChecksum(segments: { data: Uint8Array }[]): number {
	let checksum = 0xef;
	for (const seg of segments) {
		for (const b of seg.data) {
			checksum ^= b;
		}
	}
	return checksum & 0xff;
}

/** Get the checksum byte offset for a given set of segments. */
function getChecksumOffset(segments: { data: Uint8Array }[]): number {
	let bodySize = 24;
	for (const seg of segments) {
		bodySize += 8 + seg.data.length;
	}
	const alignedSize = Math.ceil((bodySize + 1) / 16) * 16;
	return APP_OFFSET + alignedSize - 1;
}

describe("recalculateEsp32Checksum", () => {
	it("should compute correct XOR checksum for a 1-segment image", async () => {
		const segData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
		const segments = [{ loadAddr: 0x3f400000, data: segData }];
		const bytes = buildImage(segments);

		// Initially checksum position should be 0
		const csOffset = getChecksumOffset(segments);
		expect(bytes[csOffset]).toBe(0);

		await recalculateEsp32Checksum(bytes);

		expect(bytes[csOffset]).toBe(expectedXorChecksum(segments));
	});

	it("should recalculate SHA256 when hash_appended=1", async () => {
		const segData = new Uint8Array([0xaa, 0xbb, 0xcc]);
		const segments = [{ loadAddr: 0x3f400000, data: segData }];
		const bytes = buildImage(segments, { hashAppended: true });

		await recalculateEsp32Checksum(bytes);

		const csOffset = getChecksumOffset(segments);
		expect(bytes[csOffset]).toBe(expectedXorChecksum(segments));

		// Verify SHA256: hash everything from APP_OFFSET through checksum byte
		const hashInput = bytes.slice(APP_OFFSET, csOffset + 1);
		const expectedHash = new Uint8Array(
			await crypto.subtle.digest("SHA-256", hashInput),
		);

		const actualHash = bytes.slice(csOffset + 1, csOffset + 1 + 32);
		expect(actualHash).toEqual(expectedHash);
	});

	it("should compute correct checksum across multiple segments", async () => {
		const seg1Data = new Uint8Array([0x10, 0x20, 0x30]);
		const seg2Data = new Uint8Array([0x40, 0x50]);
		const seg3Data = new Uint8Array([0x60, 0x70, 0x80, 0x90]);
		const segments = [
			{ loadAddr: 0x3f400000, data: seg1Data },
			{ loadAddr: 0x3ffb0000, data: seg2Data },
			{ loadAddr: 0x40080000, data: seg3Data },
		];
		const bytes = buildImage(segments);

		await recalculateEsp32Checksum(bytes);

		const csOffset = getChecksumOffset(segments);
		expect(bytes[csOffset]).toBe(expectedXorChecksum(segments));
	});

	it("should throw on invalid magic byte", async () => {
		const bytes = new Uint8Array(APP_OFFSET + 64);
		bytes[APP_OFFSET] = 0x00; // wrong magic

		await expect(recalculateEsp32Checksum(bytes)).rejects.toThrow(
			/Invalid ESP-IDF image magic/,
		);
	});

	it("should throw when segment extends beyond binary", async () => {
		// Build an image but truncate it so segment data is cut off
		const segData = new Uint8Array(100);
		const segments = [{ loadAddr: 0x3f400000, data: segData }];
		const fullImage = buildImage(segments);

		// Truncate: keep header + segment header but cut off most data
		const truncated = fullImage.slice(0, APP_OFFSET + 24 + 8 + 10);

		await expect(recalculateEsp32Checksum(truncated)).rejects.toThrow(
			/extends beyond binary/,
		);
	});

	it("should be idempotent — running twice produces same result", async () => {
		const segData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
		const segments = [{ loadAddr: 0x3f400000, data: segData }];
		const bytes = buildImage(segments, { hashAppended: true });

		await recalculateEsp32Checksum(bytes);
		const firstPass = bytes.slice();

		await recalculateEsp32Checksum(bytes);
		expect(bytes).toEqual(firstPass);
	});
});

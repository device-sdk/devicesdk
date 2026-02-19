/**
 * Recalculates the XOR checksum and SHA256 hash for an ESP-IDF app image
 * embedded at offset 0x10000 in a merged firmware binary.
 *
 * ESP-IDF image format (at APP_OFFSET):
 *   [24-byte header: magic 0xE9 at byte 0, segment_count at byte 1, hash_appended at byte 23]
 *   [For each segment: 4-byte load_addr + 4-byte data_len + data_len bytes of data]
 *   [Padding to 16-byte alignment]
 *   [1-byte XOR checksum (last byte before alignment boundary)]
 *   [32-byte SHA256 hash if hash_appended=1]
 */

const APP_OFFSET = 0x10000;
const HEADER_SIZE = 24;
const SEGMENT_HEADER_SIZE = 8; // 4-byte load_addr + 4-byte data_len
const ESP_IMAGE_MAGIC = 0xe9;
const CHECKSUM_INIT = 0xef;

export async function recalculateEsp32Checksum(
	bytes: Uint8Array,
): Promise<void> {
	if (bytes.length <= APP_OFFSET) {
		throw new Error(
			`Binary too small: ${bytes.length} bytes, need at least ${APP_OFFSET + HEADER_SIZE}`,
		);
	}

	if (bytes[APP_OFFSET] !== ESP_IMAGE_MAGIC) {
		throw new Error(
			`Invalid ESP-IDF image magic at offset 0x${APP_OFFSET.toString(16)}: expected 0xE9, got 0x${bytes[APP_OFFSET].toString(16).padStart(2, "0")}`,
		);
	}

	const segmentCount = bytes[APP_OFFSET + 1];
	const hashAppended = bytes[APP_OFFSET + 23];

	// Walk segments to compute XOR checksum and find end position
	let checksum = CHECKSUM_INIT;
	let offset = APP_OFFSET + HEADER_SIZE;

	// XOR the header bytes (all 24 bytes of the header) into the checksum
	// Actually, ESP-IDF only XORs segment data bytes, not the header itself.
	// The checksum covers: all segment data bytes (not segment headers, not image header).

	for (let seg = 0; seg < segmentCount; seg++) {
		if (offset + SEGMENT_HEADER_SIZE > bytes.length) {
			throw new Error(
				`Segment ${seg} header extends beyond binary (offset ${offset}, binary length ${bytes.length})`,
			);
		}

		// Read data_len as little-endian uint32 at offset+4
		const dataLen =
			bytes[offset + 4] |
			(bytes[offset + 5] << 8) |
			(bytes[offset + 6] << 16) |
			(bytes[offset + 7] << 24);

		const dataStart = offset + SEGMENT_HEADER_SIZE;
		const dataEnd = dataStart + dataLen;

		if (dataEnd > bytes.length) {
			throw new Error(
				`Segment ${seg} data extends beyond binary (need ${dataEnd}, have ${bytes.length})`,
			);
		}

		// XOR all data bytes
		for (let i = dataStart; i < dataEnd; i++) {
			checksum ^= bytes[i];
		}

		offset = dataEnd;
	}

	// Checksum byte position: pad to 16-byte alignment relative to APP_OFFSET,
	// then the checksum is the last byte of that aligned block
	const imageSize = offset - APP_OFFSET;
	const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
	const checksumOffset = APP_OFFSET + alignedSize - 1;

	if (checksumOffset >= bytes.length) {
		throw new Error(
			`Checksum position ${checksumOffset} extends beyond binary (length ${bytes.length})`,
		);
	}

	bytes[checksumOffset] = checksum & 0xff;

	// Recalculate SHA256 if hash_appended flag is set
	if (hashAppended === 1) {
		const hashOffset = checksumOffset + 1;
		if (hashOffset + 32 > bytes.length) {
			throw new Error(
				`SHA256 hash position ${hashOffset}+32 extends beyond binary (length ${bytes.length})`,
			);
		}

		// SHA256 covers everything from magic byte through checksum byte
		const hashInput = bytes.slice(APP_OFFSET, checksumOffset + 1);
		const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
		const hashBytes = new Uint8Array(hashBuffer);
		bytes.set(hashBytes, hashOffset);
	}
}

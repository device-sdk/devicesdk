const UF2_MAGIC_START0 = 0x0a324655;
const UF2_MAGIC_START1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_BLOCK_SIZE = 512;

/**
 * Validates UF2 block structure integrity after credential patching.
 * Verifies magic numbers, block numbering, and total block count
 * are consistent across all blocks in the file.
 */
export function validateUf2Structure(bytes: Uint8Array): void {
	if (bytes.length === 0) {
		throw new Error("UF2 file is empty");
	}
	if (bytes.length % UF2_BLOCK_SIZE !== 0) {
		throw new Error(
			`UF2 file size ${bytes.length} is not a multiple of ${UF2_BLOCK_SIZE}`,
		);
	}

	const blockCount = bytes.length / UF2_BLOCK_SIZE;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	for (let i = 0; i < blockCount; i++) {
		const offset = i * UF2_BLOCK_SIZE;

		const magic0 = view.getUint32(offset, true);
		const magic1 = view.getUint32(offset + 4, true);
		const magicEnd = view.getUint32(offset + UF2_BLOCK_SIZE - 4, true);
		const blockNo = view.getUint32(offset + 20, true);
		const totalBlocks = view.getUint32(offset + 24, true);

		if (magic0 !== UF2_MAGIC_START0) {
			throw new Error(
				`UF2 block ${i}: invalid start magic 0 (expected 0x0A324655, got 0x${magic0.toString(16).padStart(8, "0")})`,
			);
		}
		if (magic1 !== UF2_MAGIC_START1) {
			throw new Error(
				`UF2 block ${i}: invalid start magic 1 (expected 0x9E5D5157, got 0x${magic1.toString(16).padStart(8, "0")})`,
			);
		}
		if (magicEnd !== UF2_MAGIC_END) {
			throw new Error(
				`UF2 block ${i}: invalid end magic (expected 0x0AB16F30, got 0x${magicEnd.toString(16).padStart(8, "0")})`,
			);
		}
		if (blockNo !== i) {
			throw new Error(
				`UF2 block ${i}: block number mismatch (expected ${i}, got ${blockNo})`,
			);
		}
		if (totalBlocks !== blockCount) {
			throw new Error(
				`UF2 block ${i}: total blocks mismatch (expected ${blockCount}, got ${totalBlocks})`,
			);
		}
	}
}

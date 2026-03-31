import type { tableDevices } from "../types";

/**
 * Prunes the oldest non-current script versions for a device when the version
 * count is at or above the limit. Deletes from both D1 and R2.
 *
 * Returns the number of versions deleted.
 */
export async function pruneOldVersions(
	db: D1Database,
	r2: R2Bucket,
	device: tableDevices,
	userId: string,
	projectSlug: string,
	deviceSlug: string,
	maxVersions: number,
): Promise<number> {
	const countResult = await db
		.prepare("SELECT COUNT(*) as count FROM device_scripts WHERE device_id = ?")
		.bind(device.id)
		.first<{ count: number }>();

	const currentCount = countResult?.count ?? 0;
	if (currentCount < maxVersions) {
		return 0;
	}

	const toDelete = currentCount - maxVersions + 1;

	const staleVersions = await db
		.prepare(
			"SELECT id, version_id FROM device_scripts WHERE device_id = ? AND version_id != ? ORDER BY created_at ASC LIMIT ?",
		)
		.bind(device.id, device.current_version_id ?? "", toDelete)
		.all<{ id: string; version_id: string }>();

	const rows = staleVersions.results ?? [];
	for (const row of rows) {
		await r2.delete(
			`${userId}/${projectSlug}/${deviceSlug}/${row.version_id}.js`,
		);
		await db
			.prepare("DELETE FROM device_scripts WHERE id = ?")
			.bind(row.id)
			.run();
	}

	return rows.length;
}

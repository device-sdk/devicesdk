import type { Database } from "bun:sqlite";
import { MAX_KV_KEY_LENGTH, MAX_KV_VALUE_BYTES } from "../foundation/consts";

/** Keys under this prefix are reserved for the runtime and hidden from user scripts. */
export const INTERNAL_KEY_PREFIX = "__internal:";

/**
 * Per-device KV storage (device_kv table) with the runtime's reserved-key
 * rules. Extracted from deviceSession so the session class stays focused on
 * protocol/lifecycle logic; behavior is identical.
 */
export class DeviceKv {
	constructor(
		private readonly db: Database,
		private readonly deviceId: string,
	) {}

	/** User-facing read; reserved keys are rejected, never read. */
	get<T = unknown>(key: string): T | undefined {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		return this.internalGet<T>(key);
	}

	/** User-facing write; reserved keys and oversized values are rejected. */
	put<T>(key: string, value: T): void {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		if (key.length > MAX_KV_KEY_LENGTH) {
			throw new Error(
				`DeviceSDK: kv key exceeds ${MAX_KV_KEY_LENGTH} characters (got ${key.length})`,
			);
		}
		// Serialize once: the byte count bounds the stored value, and the raw
		// string is passed through so the write does not stringify again.
		const serialized = JSON.stringify(value ?? null);
		if (new TextEncoder().encode(serialized).length > MAX_KV_VALUE_BYTES) {
			throw new Error(
				`DeviceSDK: kv value exceeds ${MAX_KV_VALUE_BYTES} bytes when serialized`,
			);
		}
		this.internalPutRaw(key, serialized);
	}

	/**
	 * User-facing delete. Returns whether a value existed. Deletes are
	 * idempotent - reserved keys are silently ignored.
	 */
	remove(key: string): boolean {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) return false;
		const before = this.db
			.query("SELECT 1 AS one FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.get(this.deviceId, key);
		this.db
			.query("DELETE FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.run(this.deviceId, key);
		return before !== null;
	}

	/** Internal read (runtime keys like the cron schedule). */
	internalGet<T>(key: string): T | undefined {
		const row = this.db
			.query("SELECT value FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.get(this.deviceId, key) as { value: string | null } | null;
		if (!row || row.value === null) return undefined;
		try {
			return JSON.parse(row.value) as T;
		} catch {
			return undefined;
		}
	}

	internalPut(key: string, value: unknown): void {
		this.internalPutRaw(key, JSON.stringify(value ?? null));
	}

	internalPutRaw(key: string, serialized: string): void {
		this.db
			.query(
				`INSERT INTO device_kv (device_id, key, value, updated_at)
				 VALUES (?1, ?2, ?3, ?4)
				 ON CONFLICT (device_id, key) DO UPDATE SET value = ?3, updated_at = ?4`,
			)
			.run(this.deviceId, key, serialized, Date.now());
	}

	internalRemove(key: string): void {
		this.db
			.query("DELETE FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.run(this.deviceId, key);
	}
}

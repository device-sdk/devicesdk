import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TestServer } from "../harness";

// Placeholder ASCII strings copied verbatim from
// src/endpoints/devices/downloadFirmware.ts — the blob must contain all six
// for the patch step to succeed.
const OLD_TOKEN = "e343ecb8036442e093a47718463c1716";
const OLD_SSID = "8d477eda147344f8b9b8d3e3bef7505b";
const OLD_PASS =
	"ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8";
const OLD_HOST = "3ed66c2c3ed1474382278f70ba01dc4c";
const OLD_PROJECT_ID = "288f2d2493094af68ab37a96ef73a118";
const OLD_DEVICE_ID = "d09f91a7729141eb8911d7a0f1e1595f";
const PLACEHOLDERS =
	OLD_TOKEN + OLD_SSID + OLD_PASS + OLD_HOST + OLD_PROJECT_ID + OLD_DEVICE_ID;

const enc = new TextEncoder();
const APP_OFFSET = 0x10000;
const HEADER_SIZE = 24;
const ESP_IMAGE_MAGIC = 0xe9;

/**
 * A synthetic ESP-IDF merged image whose single segment's data carries the six
 * credential placeholders, so the download endpoint can find + patch them and
 * recalculateEsp32Checksum can still walk the structure.
 */
function buildEsp32Blob(): Uint8Array {
	const payload = enc.encode(PLACEHOLDERS);
	const dataLen = payload.length;
	const imageSize = HEADER_SIZE + 8 + dataLen;
	const alignedSize = Math.ceil((imageSize + 1) / 16) * 16;
	// hash_appended = 1 → exercise the SHA256 recompute path on download.
	const total = APP_OFFSET + alignedSize + 32;

	const bytes = new Uint8Array(total);
	for (let i = 0; i < APP_OFFSET; i++) bytes[i] = i & 0xff;
	bytes[APP_OFFSET] = ESP_IMAGE_MAGIC;
	bytes[APP_OFFSET + 1] = 1; // one segment
	bytes[APP_OFFSET + 23] = 1; // hash appended

	const segOff = APP_OFFSET + HEADER_SIZE;
	bytes[segOff + 3] = 0x40; // load addr (arbitrary, non-zero high byte)
	bytes[segOff + 4] = dataLen & 0xff;
	bytes[segOff + 5] = (dataLen >> 8) & 0xff;
	bytes[segOff + 6] = (dataLen >> 16) & 0xff;
	bytes[segOff + 7] = (dataLen >> 24) & 0xff;
	bytes.set(payload, segOff + 8);
	return bytes;
}

const UF2_BLOCK_SIZE = 512;

/** A single valid UF2 block whose payload region carries the placeholders. */
function buildUf2Blob(): Uint8Array {
	const bytes = new Uint8Array(UF2_BLOCK_SIZE);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, 0x0a324655, true); // start magic 0
	view.setUint32(4, 0x9e5d5157, true); // start magic 1
	view.setUint32(8, 0x00002000, true); // flags: familyID present
	view.setUint32(12, 0x10000000, true); // target addr
	view.setUint32(16, 256, true); // payload size
	view.setUint32(20, 0, true); // block number
	view.setUint32(24, 1, true); // total blocks
	view.setUint32(28, 0xe48bff56, true); // RP2040 familyID
	view.setUint32(UF2_BLOCK_SIZE - 4, 0x0ab16f30, true); // end magic
	// Placeholders live in the payload region (offset 32 onward, < 508).
	bytes.set(enc.encode(PLACEHOLDERS), 32);
	return bytes;
}

let srv: TestServer;

beforeAll(async () => {
	srv = await TestServer.start();
});

afterAll(() => srv.stop());

/** Raw fetch so we can read the binary octet-stream body the endpoint returns. */
async function downloadRaw(
	projectSlug: string,
	deviceSlug: string,
	token: string,
	body: Record<string, unknown>,
) {
	const res = await fetch(
		`${srv.baseUrl}/v1/projects/${projectSlug}/devices/${deviceSlug}/firmware`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"X-Forwarded-For": `10.${rand()}.${rand()}.${rand()}`,
			},
			body: JSON.stringify(body),
		},
	);
	return res;
}

function rand(): number {
	return 1 + Math.floor(Math.random() * 254);
}

describe("firmware download endpoint", () => {
	test("404 when the project does not exist", async () => {
		const auth = await srv.register({
			email: `fw-noproj-${crypto.randomUUID()}@example.com`,
		});
		const res = await srv.post("/v1/projects/nope/devices/whatever/firmware", {
			token: auth.token,
			body: { device_type: "esp32" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toMatch(/project not found/i);
	});

	test("404 when the device does not exist under an existing project", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-p1", deviceSlug: "d1" });
		const res = await srv.post("/v1/projects/fw-p1/devices/ghost/firmware", {
			token: s.auth.token,
			body: { device_type: "esp32" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { error: string }).error).toMatch(/device not found/i);
	});

	test("FIRMWARE_NOT_PUBLISHED when the device_type blob is not seeded", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-p2", deviceSlug: "d2" });
		// esp32c3 is never seeded in this suite.
		const res = await srv.post("/v1/projects/fw-p2/devices/d2/firmware", {
			token: s.auth.token,
			body: { device_type: "esp32c3" },
		});
		expect(res.status).toBe(404);
		expect((res.body as { code: string }).code).toBe("FIRMWARE_NOT_PUBLISHED");
		expect((res.body as { device_type: string }).device_type).toBe("esp32c3");
	});

	test("esp32 success: patches placeholders, recomputes checksum, rotates token", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-esp", deviceSlug: "de" });
		const seed = buildEsp32Blob();
		await srv.services.FIRMWARES.put("esp32-client.bin", seed);

		const res = await downloadRaw("fw-esp", "de", s.auth.token, {
			device_type: "esp32",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/octet-stream");
		expect(res.headers.get("content-disposition")).toBe(
			'attachment; filename="esp32-client.bin"',
		);

		const out = new Uint8Array(await res.arrayBuffer());
		expect(out.length).toBe(seed.length);
		// Patched: at minimum the rotated token bytes differ from the seed.
		expect([...out]).not.toEqual([...seed]);

		// The old placeholder token strings must be gone (patched out).
		const text = new TextDecoder("latin1").decode(out);
		expect(text).not.toContain(OLD_TOKEN);
		expect(text).not.toContain(OLD_PROJECT_ID);

		// Token rotation: exactly one managed token row for this device.
		const rows = srv.db
			.query(
				"SELECT id, managed FROM tokens WHERE user_id = ? AND description = ? AND managed = 1",
			)
			.all(s.auth.user.id, "de authentication token") as Array<{
			id: string;
		}>;
		expect(rows.length).toBe(1);
	});

	test("second esp32 download rotates the managed token (old row replaced)", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-rot", deviceSlug: "dr" });
		await srv.services.FIRMWARES.put("esp32-client.bin", buildEsp32Blob());

		const first = await downloadRaw("fw-rot", "dr", s.auth.token, {
			device_type: "esp32",
		});
		expect(first.status).toBe(200);
		const row1 = srv.db
			.query(
				"SELECT id FROM tokens WHERE user_id = ? AND description = ? AND managed = 1",
			)
			.get(s.auth.user.id, "dr authentication token") as { id: string };
		expect(row1).toBeTruthy();

		const second = await downloadRaw("fw-rot", "dr", s.auth.token, {
			device_type: "esp32",
		});
		expect(second.status).toBe(200);
		const rows = srv.db
			.query(
				"SELECT id FROM tokens WHERE user_id = ? AND description = ? AND managed = 1",
			)
			.all(s.auth.user.id, "dr authentication token") as Array<{ id: string }>;
		// Still exactly one managed row, and it's a different id (old deleted).
		expect(rows.length).toBe(1);
		expect(rows[0].id).not.toBe(row1.id);
	});

	test("pico-w success: validates UF2 structure and returns the patched blob", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-pico", deviceSlug: "dp" });
		const seed = buildUf2Blob();
		await srv.services.FIRMWARES.put("devicesdk-pico-w-client.uf2", seed);

		const res = await downloadRaw("fw-pico", "dp", s.auth.token, {
			device_type: "pico-w",
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("content-disposition")).toBe(
			'attachment; filename="devicesdk-client.uf2"',
		);
		const out = new Uint8Array(await res.arrayBuffer());
		expect(out.length).toBe(UF2_BLOCK_SIZE);
		expect([...out]).not.toEqual([...seed]);
		// UF2 magics must be intact (patch only touched the payload region).
		const view = new DataView(out.buffer);
		expect(view.getUint32(0, true)).toBe(0x0a324655);
		expect(view.getUint32(UF2_BLOCK_SIZE - 4, true)).toBe(0x0ab16f30);
	});

	test("400 (Zod) when the ssid override exceeds the schema's 32-byte cap", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-ssid", deviceSlug: "ds" });
		await srv.services.FIRMWARES.put("esp32-client.bin", buildEsp32Blob());
		// The body schema declares ssid as .max(32), so a 33-char value is
		// rejected at validation (400) before the patch step runs.
		const res = await downloadRaw("fw-ssid", "ds", s.auth.token, {
			device_type: "esp32",
			ssid: "x".repeat(33),
		});
		expect(res.status).toBe(400);
	});

	test("400 (padAsciiToLength) when the host override exceeds 32 bytes", async () => {
		const s = await srv.scaffold({ projectSlug: "fw-host", deviceSlug: "dh" });
		await srv.services.FIRMWARES.put("esp32-client.bin", buildEsp32Blob());
		// `host` has no Zod max, but HOST_LENGTH is 32 — so a 40-char host reaches
		// padAsciiToLength, which throws "Hostname too long" -> caught -> 400.
		const res = await srv.post("/v1/projects/fw-host/devices/dh/firmware", {
			token: s.auth.token,
			body: { device_type: "esp32", host: "h".repeat(40) },
		});
		expect(res.status).toBe(400);
		expect((res.body as { error: string }).error).toMatch(/hostname too long/i);
	});

	test("exactly-32-byte ssid is accepted and patched into the blob", async () => {
		const s = await srv.scaffold({
			projectSlug: "fw-ssid2",
			deviceSlug: "ds2",
		});
		await srv.services.FIRMWARES.put("esp32-client.bin", buildEsp32Blob());
		const ssid = "y".repeat(32);
		const res = await downloadRaw("fw-ssid2", "ds2", s.auth.token, {
			device_type: "esp32",
			ssid,
		});
		expect(res.status).toBe(200);
		const out = new Uint8Array(await res.arrayBuffer());
		const text = new TextDecoder("latin1").decode(out);
		expect(text).toContain(ssid);
	});
});

import type { DeviceType } from "../config.js";
import {
	buildErrorMessage,
	DeviceSDKApiError,
	dumpResponseBodyIfVerbose,
	fetchAllPages,
	getApiUrl,
	parseErrorBody,
	request,
} from "./shared.js";

export type { DeviceType };

// Device endpoints
export interface Device {
	id: string;
	device_id: string;
	name?: string | null;
	description?: string | null;
	current_version_id?: string | null;
	last_connected_at?: number | null;
	created_at: number;
	updated_at: number;
	status?: string;
}

export async function listDevices(
	token: string,
	projectId: string,
): Promise<Device[]> {
	return fetchAllPages<Device>(`/v1/projects/${projectId}/devices`, token);
}

export async function getDevice(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<Device> {
	return request<Device>(
		`/v1/projects/${projectId}/devices/${deviceId}`,
		{},
		token,
	);
}

export async function createDevice(
	token: string,
	projectId: string,
	deviceId: string,
	name?: string,
	description?: string,
): Promise<Device> {
	return request<Device>(
		`/v1/projects/${projectId}/devices`,
		{
			method: "POST",
			body: JSON.stringify({ device_id: deviceId, name, description }),
		},
		token,
	);
}

export interface DeviceStatus {
	connected: boolean;
	connected_since: number | null;
	last_connected_at: number | null;
	current_version_id: string | null;
}

export async function getDeviceStatus(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<DeviceStatus> {
	return request<DeviceStatus>(
		`/v1/projects/${projectId}/devices/${deviceId}/status`,
		{},
		token,
	);
}

export async function deleteDevice(
	token: string,
	projectId: string,
	deviceId: string,
): Promise<{ deleted: boolean; device_id: string }> {
	return request<{ deleted: boolean; device_id: string }>(
		`/v1/projects/${projectId}/devices/${deviceId}`,
		{
			method: "DELETE",
		},
		token,
	);
}

export function isEsp32DeviceType(deviceType: DeviceType): boolean {
	return deviceType.startsWith("esp32");
}

export function getEsp32ChipName(deviceType: DeviceType): string {
	if (deviceType === "esp32c61") return "esp32c61";
	if (deviceType === "esp32c3") return "esp32c3";
	return "esp32";
}

export function isPicoDeviceType(deviceType: DeviceType): boolean {
	return deviceType === "pico-w" || deviceType === "pico2-w";
}

export async function downloadDeviceFirmware(
	token: string,
	projectId: string,
	deviceId: string,
	wifi: { ssid: string; password: string },
	deviceType: DeviceType,
	options?: { host?: string },
): Promise<Buffer> {
	const url = `${getApiUrl()}/v1/projects/${projectId}/devices/${deviceId}/firmware`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			ssid: wifi.ssid,
			pass: wifi.password,
			device_type: deviceType,
			...(options?.host ? { host: options.host } : {}),
		}),
	});

	if (!response.ok) {
		let responseBody: unknown;
		let responseText: string | undefined;
		try {
			responseText = await response.text();
			responseBody = responseText ? JSON.parse(responseText) : undefined;
		} catch {
			// ignore parse failure
		}

		const parsed = parseErrorBody(responseBody);
		dumpResponseBodyIfVerbose(response.status, responseBody, responseText);
		throw new DeviceSDKApiError(
			buildErrorMessage(response.status, parsed),
			response.status,
			parsed.code,
			parsed.docs,
			responseBody ?? responseText,
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

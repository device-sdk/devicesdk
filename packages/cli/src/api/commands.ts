import { request } from "./shared.js";

// Device command endpoints
export interface DeviceCommandRequest {
	type: string;
	payload: Record<string, unknown>;
}

export interface DeviceCommandResponse {
	id: string;
	type: string;
	payload: Record<string, unknown>;
}

export async function sendDeviceCommand(
	token: string,
	projectId: string,
	deviceId: string,
	command: DeviceCommandRequest,
): Promise<DeviceCommandResponse> {
	return request<DeviceCommandResponse>(
		`/v1/projects/${projectId}/devices/${deviceId}/command`,
		{
			method: "POST",
			body: JSON.stringify(command),
		},
		token,
	);
}

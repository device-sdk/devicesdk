import fs from "node:fs/promises";
import path from "node:path";

export const createTestProject = async (projectPath: string) => {
	const devicesdkConfig = `
import { defineConfig } from '${path.resolve(projectPath, "../../src/config")}';
export default defineConfig({
  projectId: "test-project",
  devices: {
    "temperature-sensor": {
      main: "./devices/temperatureSensor.ts",
      className: "TemperatureSensorDevice",
      deviceType: "pico-w",
      name: "Temperature Sensor",
      wifi: { ssid: "test-ssid", password: "test-pass" },
    },
  },
});
`;
	await fs.writeFile(path.join(projectPath, "devicesdk.ts"), devicesdkConfig);

	await fs.mkdir(path.join(projectPath, "devices"));
	const deviceFile = `
export class TemperatureSensorDevice {
  fetch() {
    return new Response("Hello from TemperatureSensorDevice");
  }
}
`;
	await fs.writeFile(
		path.join(projectPath, "devices/temperatureSensor.ts"),
		deviceFile,
	);
};

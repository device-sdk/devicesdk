// Basic LED Blink Example
// This template demonstrates a simple LED blinking pattern
// Upload this script to your project to get started

import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	async onDeviceConnect() {
		console.info("Device connected! Starting blink pattern...");
	}
}

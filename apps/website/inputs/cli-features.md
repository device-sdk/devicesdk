# DeviceSDK CLI — Website Content Outline

## Headline & Value Proposition
- "Build, run, and deploy IoT apps from your laptop to real devices in minutes."
- Highlights: unified CLI, instant auth, local simulator, seamless deploys, one-click Pico flashing.

## Key Features
- **Unified CLI (`devicesdk`)**: login, init, dev, build, deploy, flash from one tool.
- **Fast project bootstrap**: `devicesdk init` scaffolds config and starter device code (templates for basic, multi-device, empty) and can auto-create the cloud project.
- **Typed config**: `devicesdk.ts`/`defineConfig` with `projectId`, per-device `main`/`entrypoint`, optional name/description.
- **Local development server**: `devicesdk dev` builds devices and runs the workerd-based simulator; chooses a free port if 8181 is busy.
- **Modern build pipeline**: esbuild targeting ESM / ES2022; unbundled outputs into `.devicesdk/build`; supports per-device builds, custom outdir, minify, and sourcemaps.
- **Deployment workflow**: `devicesdk deploy` builds then uploads all devices (or one) to `api.devicesdk.com`; auto-creates missing projects/devices; supports dry-run and release messages.
- **Authentication**: device-code flow with tokens stored securely in `~/.devicesdk/credentials.json`; `login`, `logout`, `whoami`; verbose mode for debugging.
- **Firmware flashing (Pico)**: `devicesdk flash <device-id>` downloads UF2 firmware, waits for BOOTSEL volume (`RPI-RP2` or `RP2350`), copies and ejects; timeout configurable (default ~2 minutes); saves firmware under `.devicesdk/firmware/<device>.uf2`.
- **Configurable everywhere**: global `--config` / `DEVICESDK_CONFIG`, `--verbose`, and `DEVICESDK_API_URL` override; `DEVICESDK_TOKEN` for CI.
- **Error clarity**: consistent exit codes and human-friendly messages; exposes API response bodies when helpful.

## Benefits to Emphasize
- **Familiar DX**: Cloudflare Wrangler-like flow for IoT scripts; TypeScript-first.
- **Speed**: instant scaffolding, fast esbuild, no bundling overhead.
- **Reliability**: strict entrypoint validation; automatic project/device creation prevents drift.
- **Security**: tokens stored with 0600 perms; refresh handled for you.
- **Hardware-ready**: built-in Pico flashing; firmware download + copy in one command.

## Example Commands (for site snippets)
- `devicesdk login` — authenticate via browser code flow.
- `devicesdk init my-project -y` — generate config and starter files.
- `devicesdk dev` — run local simulator.
- `devicesdk build --device sensor-hub --sourcemap` — compile one device.
- `devicesdk deploy -m "v1.2.0 release"` — build + upload with a note.
- `devicesdk flash pico-1 --timeout 30000` — flash a Raspberry Pi Pico.

## Architecture Notes (for technical buyers)
- API base: `https://api.devicesdk.com` (override with `DEVICESDK_API_URL`).
- Credentials: `~/.devicesdk/credentials.json` (0600), auto-refreshing.
- Build target: esbuild, ESM, ES2022, non-bundled artifacts in `.devicesdk/build`.
- Local simulator: workerd-backed, dynamic port selection.

## Ecosystem & Examples
- Example projects included (`packages/example`, `examples/temperatureToDiscord`) to copy/paste from.
- Shared TypeScript config package for consistent builds.
- Simulator assets bundled in `packages/simulation`.

## Call-to-Action Ideas
- Primary CTA: "Install the CLI" (`npm i -g @devicesdk/cli`).
- Secondary CTA: "Try the starter" with `devicesdk init` steps.
- For hardware users: "Flash a Pico in one command" (link to quick guide).

## Support & Troubleshooting Highlights
- Common flags: `--config`, `--verbose`, `--help`, `--version`.
- Flashing tips: ensure BOOTSEL volume appears; supports `RPI-RP2` / `RP2350`.
- Build tips: check `main` path and TypeScript output.

## Differentiators
- Wrangler-like IoT workflow (scripts to devices) with built-in firmware flashing.
- Works both locally and in CI via tokens/env vars.
- Automatic project/device creation on deploy reduces setup friction.

## Example Config (`devicesdk.ts`)
```ts
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "example",
  devices: {
    "device": {
      main: "./src/devices/device.ts",
      entrypoint: "MyDevice",
      name: "Main Device",
      wifi: {
        ssid: 'example',
        password: 'password'
      }
    }
  },
});
```

## Example Device Entrypoint
```ts
// src/devices/lobby-sensor.ts
import { DeviceEntrypoint } from "@devicesdk/core";

const BUTTON_PIN = 20;  // GPIO pin connected to button (active high)
const LED_PIN = 99;     // GPIO pin connected to LED

export default class MyDevice extends DeviceEntrypoint {
	async onDeviceConnect() {
		// Enable GPIO input monitoring on the button pin
		// The device will send gpio_state_changed messages when the pin changes
		await this.env.DEVICE.configureGpioInputMonitoring(BUTTON_PIN, true);

		// Initialize LED to off
		await this.env.DEVICE.setGpioState(LED_PIN, "low");
		await this.env.DEVICE.kv.put("ledOn", false);

		console.info(`Monitoring GPIO ${BUTTON_PIN} for button presses`);
	}

	async onMessage(message) {
		// Handle GPIO state change events from the device
		if (message.type === "gpio_state_changed" && message.payload.pin === BUTTON_PIN) {
			const buttonState = message.payload.state;
			console.info(`Button pin ${BUTTON_PIN} changed to ${buttonState}`);

			// Toggle LED on button press (when pin goes high)
			if (buttonState === "high") {
				const ledOn = !(await this.env.DEVICE.kv.get("ledOn"));
				await this.env.DEVICE.kv.put("ledOn", ledOn);
				await this.env.DEVICE.setGpioState(LED_PIN, ledOn ? "high" : "low");
				console.info(`LED toggled ${ledOn ? "ON" : "OFF"}`);
			}
		}
	}
}

```

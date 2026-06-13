import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { execa } from "execa";
import { createProject, DeviceSDKApiError } from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";

interface InitOptions {
	yes?: boolean;
	template?: string;
	noGit?: boolean;
}

function resolvePackageVersion(packageName: string): string {
	const require = createRequire(import.meta.url);
	const pkgJsonPath = require.resolve(`${packageName}/package.json`);
	const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
		version?: string;
	};
	if (!pkg.version) {
		throw new Error(`${packageName}/package.json has no version field`);
	}
	return pkg.version;
}

function detectPackageManager(): "pnpm" | "yarn" | "npm" | "bun" {
	const ua = process.env.npm_config_user_agent ?? "";
	if (ua.startsWith("pnpm/")) return "pnpm";
	if (ua.startsWith("yarn/")) return "yarn";
	if (ua.startsWith("bun/")) return "bun";
	return "npm";
}

interface ScaffoldDevice {
	main: string;
	className: string;
	name?: string;
	description?: string;
}

const DEVICE_CODE = `import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class Device extends DeviceEntrypoint {
  async onDeviceConnect() {
    console.log("Device connected");
    // Light up the onboard LED on first connect (virtual pin 99 on Pico W / ESP32).
    await this.env.DEVICE.setGpioState(99, "high");
  }

  async onMessage(message: DeviceResponse) {
    // \`message\` is a discriminated union — narrow on \`message.type\`.
    if (message.type === "pin_state_update") {
      console.log(\`pin \${message.payload.pin} = \${message.payload.value}\`);
    }
  }
}
`;

const SENSOR_CODE = `import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class Sensor extends DeviceEntrypoint {
  async onMessage(message: DeviceResponse) {
    if (message.type === "temperature_result") {
      // Forward to another device in this project (RPC).
      // await this.env.DEVICES["controller"].handleTemperature(message.payload.celsius);
      console.log(\`temperature: \${message.payload.celsius}°C\`);
    }
  }
}
`;

const CONTROLLER_CODE = `import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class Controller extends DeviceEntrypoint {
  // RPC method callable from other devices in the same project via
  // \`this.env.DEVICES["controller"].handleTemperature(celsius)\`.
  async handleTemperature(celsius: number) {
    if (celsius > 25) {
      await this.env.DEVICE.setGpioState(99, "high"); // turn on cooling
    } else {
      await this.env.DEVICE.setGpioState(99, "low");
    }
  }

  async onMessage(_message: DeviceResponse) {
    // Inbound device events (this controller's own hardware) handled here.
  }
}
`;

const TEMPLATES: Record<
	string,
	{
		devices: Record<string, ScaffoldDevice>;
		deviceFiles: Record<string, string>;
	}
> = {
	basic: {
		devices: {
			device: {
				main: "./src/devices/device.ts",
				className: "Device",
				name: "Main Device",
			},
		},
		deviceFiles: {
			"./src/devices/device.ts": DEVICE_CODE,
		},
	},
	"multi-device": {
		devices: {
			"sensor-1": {
				main: "./src/devices/sensor.ts",
				className: "Sensor",
				name: "Temperature Sensor",
			},
			controller: {
				main: "./src/devices/controller.ts",
				className: "Controller",
				name: "Main Controller",
			},
		},
		deviceFiles: {
			"./src/devices/sensor.ts": SENSOR_CODE,
			"./src/devices/controller.ts": CONTROLLER_CODE,
		},
	},
	empty: {
		devices: {},
		deviceFiles: {},
	},
};

function generateConfigFile(
	projectId: string,
	devices: Record<string, ScaffoldDevice>,
): string {
	const devicesStr = Object.entries(devices)
		.map(([key, value]) => {
			const props = [
				`      main: "${value.main}"`,
				`      className: "${value.className}"`,
				`      deviceType: "pico-w"`,
				`      wifi: {\n        ssid: "YOUR_WIFI_SSID",\n        password: "YOUR_WIFI_PASSWORD",\n      }`,
			];
			if (value.name) props.push(`      name: "${value.name}"`);
			if (value.description)
				props.push(`      description: "${value.description}"`);
			return `    "${key}": {\n${props.join(",\n")},\n    }`;
		})
		.join(",\n");

	return `import { defineConfig } from "@devicesdk/cli";

// Fill in real Wi-Fi credentials before running \`devicesdk flash\`.
// Change \`deviceType\` to match your hardware: pico-w, pico2-w, esp32, esp32c61, esp32c3.
export default defineConfig({
  projectId: "${projectId}",
  devices: {
${devicesStr}
  },
});
`;
}

function generatePackageJson(projectId: string): string {
	const coreVersion = resolvePackageVersion("@devicesdk/core");
	const cliVersion = resolvePackageVersion("@devicesdk/cli");
	return JSON.stringify(
		{
			name: projectId,
			version: "1.0.0",
			private: true,
			type: "module",
			scripts: {
				dev: "devicesdk dev",
				build: "devicesdk build",
				deploy: "devicesdk deploy",
			},
			dependencies: {
				"@devicesdk/core": `^${coreVersion}`,
			},
			devDependencies: {
				"@devicesdk/cli": `^${cliVersion}`,
				typescript: "^5.3.0",
			},
		},
		null,
		2,
	);
}

function generateTsConfig(): string {
	return JSON.stringify(
		{
			compilerOptions: {
				target: "ES2022",
				module: "ESNext",
				moduleResolution: "bundler",
				strict: true,
				esModuleInterop: true,
				skipLibCheck: true,
				outDir: "./dist",
			},
			include: ["src/**/*", "devicesdk.ts"],
			exclude: ["node_modules"],
		},
		null,
		2,
	);
}

function generateGitignore(): string {
	return `node_modules/
dist/
.devicesdk/
*.log
.env
.env.local
`;
}

function generateAgentsMd(projectId: string): string {
	return `# ${projectId} — DeviceSDK project

This directory holds a [DeviceSDK](https://devicesdk.com) project. Read this
file before generating or editing code.

## What runs where

DeviceSDK splits a project into two halves:

- **Device script** (the TypeScript files under \`src/devices/\`) — runs
  **in-process on your self-hosted DeviceSDK server**, **not on the
  microcontroller** and **not in Node.js**. It receives events from the device
  and sends commands back.
- **Firmware** — runs on the microcontroller (Pico W, ESP32, etc.). DeviceSDK
  ships precompiled firmware; you don't write C here. Firmware exposes
  hardware to the device script over WebSocket.

When the user says "the device", clarify whether they mean the *script*
(server) or the *firmware* (chip). Most code lives in the script.

## Commands

| Command | Purpose |
|---|---|
| \`devicesdk dev\` | Start the local simulator + dev server |
| \`devicesdk build\` | Bundle device scripts into \`.devicesdk/build\` and regenerate \`devicesdk-env.d.ts\` |
| \`devicesdk deploy\` | Push the build to your DeviceSDK server |
| \`devicesdk flash <device>\` | Flash matching firmware onto a connected board |
| \`devicesdk logs <project> <device> --tail\` | Stream live logs |
| \`devicesdk inspect <device>\` | Interactive hardware inspection |
| \`devicesdk env set KEY=VALUE\` | Set a project-scoped secret |
| \`devicesdk status\` | Show project + device state |

After editing \`devicesdk.ts\`, run \`devicesdk build\` so \`devicesdk-env.d.ts\`
regenerates — the inter-device RPC types come from there.

## Project layout

\`\`\`
${projectId}/
├── devicesdk.ts          # project + device configuration
├── devicesdk-env.d.ts    # generated; do not edit
├── src/devices/          # one file per device entrypoint
├── package.json
├── tsconfig.json
└── AGENTS.md             # this file
\`\`\`

## Writing a device script

Extend \`DeviceEntrypoint\` and export the class with a **named** export
matching \`className\` in \`devicesdk.ts\`:

\`\`\`typescript
import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";

export class Thermostat extends DeviceEntrypoint {
  crons = { tick: "*/5 * * * *" }; // every 5 minutes UTC

  async onDeviceConnect() {
    await this.env.DEVICE.setGpioState(99, "high"); // virtual pin 99 = onboard LED
  }

  async onCron() {
    await this.env.DEVICE.getTemperature();
  }

  async onMessage(message: DeviceResponse) {
    if (message.type === "temperature_result") {
      await this.env.DEVICE.kv.put("last_temp", message.payload.celsius);
    }
  }
}
\`\`\`

## API surface (what's available on \`this\`)

- \`this.env.DEVICE\` — hardware control + per-device KV. Methods include
  \`setGpioState(pin, "high"|"low")\`, \`setPwmState(pin, hz, duty)\`,
  \`getPinState(pin, "digital"|"analog")\`, \`i2cRead/Write\`, \`spiTransfer\`,
  \`uartWrite/Read\`, \`getTemperature()\`, \`pioWs2812Configure/Update\`,
  \`emitState(entityId, value)\`, \`reboot()\`, and \`kv.{get,put,delete}\`.
- \`this.env.VARS\` — project-scoped env vars (\`get(key)\`, \`getAll()\`).
- \`this.env.DEVICES\` — typed RPC to other devices in the project, e.g.
  \`await this.env.DEVICES["sensor-1"].readSomething()\`.
- Lifecycle hooks: \`onDeviceConnect\`, \`onDeviceDisconnect\`,
  \`onMessage(message)\`, \`onCron(name)\`.

The full surface is documented at
[devicesdk.com/docs/concepts/device-api/](https://devicesdk.com/docs/concepts/device-api/)
and via JSDoc on every export in
\`node_modules/@devicesdk/core/dist/index.d.ts\`. Read that .d.ts before
inventing API names — agent training data is often stale.

## Common mistakes

- **Don't use \`node:fs\`, \`node:path\`, or any \`node:*\` import** — the
  runtime is not Node. Use \`fetch\` for HTTP, \`this.env.DEVICE.kv\` for
  storage, \`this.env.VARS\` for secrets.
- **Don't \`npm install\` an Arduino-style library.** Hardware is reached only
  through \`this.env.DEVICE\`. Sensors that aren't directly supported usually
  speak I2C — read their datasheet and use \`i2cRead\`/\`i2cWrite\`.
- **Don't type \`onMessage(message: any)\`.** Use
  \`onMessage(message: DeviceResponse)\` and narrow on \`message.type\`. The
  union is exhaustive.
- **Don't hardcode pin 25 for the LED on the Pico W** — the onboard LED is on
  the WiFi chip, not GPIO 25. Use **virtual pin 99** for portability across
  Pico W, ESP32-C3, ESP32-C61.
- **Don't pass \`50\` for half PWM duty cycle.** \`dutyCycle\` is **0..1**;
  half is \`0.5\`.
- **Don't rename \`devicesdk.ts\` to \`devicesdk.config.ts\`** — the loader
  reads \`devicesdk.ts\` (or any parent \`devicesdk.ts\`).
- **Don't use \`entrypoint:\` in \`devicesdk.ts\`** — the field was renamed to
  \`className:\`.
- **Don't add long-running loops** in a hook. The runtime budgets CPU per
  event. For periodic work use a \`crons = { ... }\` declaration.
- **Don't \`return\` a value from \`onMessage\`** — its return type is
  \`void | Promise<void>\`. To respond to the device, call methods on
  \`this.env.DEVICE\`.

## Hardware quick reference

- Pico W / Pico 2 W onboard LED: virtual pin 99 (maps to WiFi-chip LED on Pico
  W, GPIO 25 on Pico 2 W).
- ESP32-C3 DevKitM-1 onboard LED: virtual pin 99 (WS2812 on GPIO 8).
- ESP32-C61 DevKitC-1 onboard LED: virtual pin 99 (WS2812 on GPIO 5).
- I2C addresses are 7-bit hex strings: \`"0x3C"\`, \`"0x76"\`. Bytes in
  \`i2cWrite\` are arrays of single-byte hex strings: \`["0xAE", "0xD5"]\`.

## Recipes (search these before writing from scratch)

- [Read a BME280 sensor](https://devicesdk.com/docs/recipes/read-bme280/)
- [Toggle an LED with a button](https://devicesdk.com/docs/recipes/button-toggles-led/)
- [Persist state across reboots](https://devicesdk.com/docs/recipes/persist-counter-kv/)
- [Schedule a daily summary](https://devicesdk.com/docs/recipes/daily-cron-summary/)
- [Drive a WS2812 strip](https://devicesdk.com/docs/recipes/ws2812-rainbow/)
- [Surface a Home Assistant entity](https://devicesdk.com/docs/recipes/sensor-to-home-assistant/)
- [Two devices talking to each other](https://devicesdk.com/docs/recipes/two-devices-rpc/)

Full cookbook: <https://devicesdk.com/docs/recipes/>
`;
}

function generateCursorRules(): string {
	return `---
description: DeviceSDK device-script rules
globs: ["**/*.ts", "devicesdk.ts"]
alwaysApply: true
---

@../../AGENTS.md
`;
}

function generateMcpJson(): string {
	return JSON.stringify(
		{
			mcpServers: {
				devicesdk: {
					command: "npx",
					args: ["-y", "@devicesdk/mcp"],
				},
			},
		},
		null,
		2,
	);
}

function generateProjectReadme(projectId: string): string {
	return `# ${projectId}

A [DeviceSDK](https://devicesdk.com) project.

## Quick reference

\`\`\`bash
devicesdk dev          # local simulator
devicesdk build        # bundle device scripts (regenerates devicesdk-env.d.ts)
devicesdk deploy       # push to your DeviceSDK server
devicesdk flash <id>   # flash firmware onto a connected board
devicesdk logs <project> <device> --tail
devicesdk env set KEY=VALUE
\`\`\`

## Layout

- \`devicesdk.ts\` — project + device configuration.
- \`src/devices/\` — one TypeScript file per device entrypoint.
- \`AGENTS.md\` — instructions for AI coding agents working on this project.

## Docs

- [Quickstart](https://devicesdk.com/docs/quickstart/)
- [Device Entrypoints](https://devicesdk.com/docs/concepts/entrypoints/)
- [Cookbook](https://devicesdk.com/docs/recipes/)
- [API reference](https://devicesdk.com/docs/concepts/device-api/)
`;
}

export default async function init(
	projectIdArg?: string,
	options: InitOptions = {},
): Promise<void> {
	const templateName = options.template || "basic";
	const template = TEMPLATES[templateName as keyof typeof TEMPLATES];

	if (!template) {
		console.error(`✗ Error: Unknown template "${templateName}"\n`);
		console.error("  Available templates: basic, multi-device, empty");
		process.exit(EXIT.CONFIG_INVALID);
	}

	const projectId = projectIdArg || "my-project";
	const projectDir = projectIdArg
		? path.resolve(process.cwd(), projectId)
		: process.cwd();
	const configPath = path.join(projectDir, "devicesdk.ts");

	// Check if config already exists
	const configExists = await fs
		.access(configPath)
		.then(() => true)
		.catch(() => false);
	if (configExists) {
		console.error("✗ Error: devicesdk.ts already exists\n");
		console.error("  This directory is already a DeviceSDK project.");
		process.exit(EXIT.GENERIC);
	}

	try {
		const token = await requireAuth();

		// Create project on API
		console.log(`Creating project "${projectId}" on DeviceSDK...`);
		try {
			await createProject(token, projectId);
			console.log(`✓ Created project "${projectId}" on DeviceSDK`);
		} catch (error) {
			if (error instanceof DeviceSDKApiError && error.statusCode === 409) {
				console.log(`✓ Project "${projectId}" already exists on DeviceSDK`);
			} else {
				throw error;
			}
		}

		// Create project directory if needed
		if (projectIdArg) {
			await fs.mkdir(projectDir, { recursive: true });
		}

		// Generate config file
		await fs.writeFile(
			configPath,
			generateConfigFile(projectId, template.devices),
		);
		console.log("✓ Generated devicesdk.ts");

		// Generate package.json
		const packageJsonPath = path.join(projectDir, "package.json");
		try {
			await fs.access(packageJsonPath);
			// package.json exists, don't overwrite
		} catch {
			await fs.writeFile(packageJsonPath, generatePackageJson(projectId));
			console.log("✓ Generated package.json");
		}

		// Generate tsconfig.json
		const tsconfigPath = path.join(projectDir, "tsconfig.json");
		try {
			await fs.access(tsconfigPath);
		} catch {
			await fs.writeFile(tsconfigPath, generateTsConfig());
			console.log("✓ Generated tsconfig.json");
		}

		// Generate .gitignore
		const gitignorePath = path.join(projectDir, ".gitignore");
		try {
			await fs.access(gitignorePath);
		} catch {
			await fs.writeFile(gitignorePath, generateGitignore());
			console.log("✓ Generated .gitignore");
		}

		// Generate AGENTS.md so AI coding agents working in the user's project
		// have version-matched context.
		const agentsMdPath = path.join(projectDir, "AGENTS.md");
		try {
			await fs.access(agentsMdPath);
		} catch {
			await fs.writeFile(agentsMdPath, generateAgentsMd(projectId));
			console.log("✓ Generated AGENTS.md");
		}
		const cursorRulesDir = path.join(projectDir, ".cursor", "rules");
		const cursorRulesPath = path.join(cursorRulesDir, "devicesdk.mdc");
		try {
			await fs.access(cursorRulesPath);
		} catch {
			await fs.mkdir(cursorRulesDir, { recursive: true });
			await fs.writeFile(cursorRulesPath, generateCursorRules());
			console.log("✓ Generated .cursor/rules/devicesdk.mdc");
		}

		// Generate .mcp.json so users with MCP-aware agents (OpenCode, Claude
		// Code, Cursor) get the @devicesdk/mcp server preconfigured.
		const mcpJsonPath = path.join(projectDir, ".mcp.json");
		try {
			await fs.access(mcpJsonPath);
		} catch {
			await fs.writeFile(mcpJsonPath, generateMcpJson());
			console.log("✓ Generated .mcp.json");
		}

		// Generate project README.md
		const readmePath = path.join(projectDir, "README.md");
		try {
			await fs.access(readmePath);
		} catch {
			await fs.writeFile(readmePath, generateProjectReadme(projectId));
			console.log("✓ Generated README.md");
		}

		// Generate device files
		for (const [relativePath, code] of Object.entries(template.deviceFiles)) {
			const devicePath = path.join(projectDir, relativePath);
			const deviceDir = path.dirname(devicePath);
			await fs.mkdir(deviceDir, { recursive: true });

			try {
				await fs.access(devicePath);
			} catch {
				await fs.writeFile(devicePath, code);
				console.log(`✓ Generated ${relativePath}`);
			}
		}

		// Initialize git if not disabled
		if (!options.noGit) {
			try {
				await fs.access(path.join(projectDir, ".git"));
			} catch {
				try {
					await execa("git", ["init"], { cwd: projectDir, stdio: "ignore" });
					console.log("✓ Initialized git repository");
				} catch {
					// Git not available, skip
				}
			}
		}

		// Install dependencies using the package manager that invoked this command
		const packageManager = detectPackageManager();
		console.log(`\nInstalling dependencies with ${packageManager}...`);
		try {
			await execa(packageManager, ["install"], {
				cwd: projectDir,
				stdio: "inherit",
			});
			console.log("✓ Installed dependencies");
		} catch {
			console.log(
				`⚠ Could not install dependencies. Run \`${packageManager} install\` manually.`,
			);
		}

		console.log(`
Next steps:`);
		if (projectIdArg) {
			console.log(`  cd ${projectId}`);
		}
		console.log(`  devicesdk dev           # Start local development
  devicesdk deploy        # Deploy to your DeviceSDK server
`);
	} catch (error) {
		console.error("\n✗ Error: Failed to initialize project\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(EXIT.GENERIC);
	}
}

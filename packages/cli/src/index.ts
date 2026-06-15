#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

import build from "./commands/build.js";
import deploy from "./commands/deploy.js";
import dev from "./commands/dev.js";
import { envList, envSet, envUnset } from "./commands/env.js";
import flash from "./commands/flash.js";
import init from "./commands/init.js";
import inspect from "./commands/inspect.js";
import login from "./commands/login.js";
import logout from "./commands/logout.js";
import logs from "./commands/logs.js";
import status from "./commands/status.js";
import whoami from "./commands/whoami.js";

export { defineConfig } from "./config.js";

const program = new Command();

program
	.name("devicesdk")
	.description(
		"CLI tool for developing and deploying DeviceSDK IoT applications",
	)
	.version(pkg.version)
	.addHelpText(
		"after",
		`
Docs: https://devicesdk.com/docs/cli/
Set DEVICESDK_OUTPUT=json to make every read command emit machine-readable JSON.`,
	);

// Auth commands
program
	.command("login")
	.description("Authenticate the CLI with your self-hosted DeviceSDK server")
	.option(
		"-H, --host <url>",
		"Server URL (e.g. http://raspberrypi.local:8080); stored for later commands",
	)
	.option("-v, --verbose", "Enable verbose output")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk login --host http://raspberrypi.local:8080
  $ devicesdk login

With no --host, the CLI will try to discover a server on the LAN via mDNS
(default: devicesdk.local on port 8080). Set DEVICESDK_MDNS_HOSTNAME and
DEVICESDK_MDNS_PORT to override the defaults.

More: https://devicesdk.com/docs/cli/login/`,
	)
	.action(login);

program
	.command("logout")
	.description("Remove stored credentials")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk logout

More: https://devicesdk.com/docs/cli/login/`,
	)
	.action(logout);

program
	.command("whoami")
	.description("Display current authenticated user")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk whoami
  $ devicesdk whoami --json

More: https://devicesdk.com/docs/cli/login/`,
	)
	.action((options) => whoami(options));

// Project commands
program
	.command("init [project-id]")
	.description("Initialize a new DeviceSDK project")
	.option("-y, --yes", "Skip prompts and use defaults")
	.option(
		"--template <name>",
		"Use a starter template (basic, multi-device, empty)",
		"basic",
	)
	.option("--no-git", "Skip git initialization")
	.addHelpText(
		"after",
		`
Generates AGENTS.md, .cursor/rules/devicesdk.mdc, and .mcp.json so AI
coding agents working in the new project have project-specific context.

Examples:
  $ devicesdk init my-iot-project
  $ devicesdk init --template multi-device my-farm
  $ devicesdk init --no-git empty-scaffold

More: https://devicesdk.com/docs/cli/init/`,
	)
	.action((projectId, options) => init(projectId, options));

// Development commands
program
	.command("dev")
	.description("Run the local development server")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("-p, --port <port>", "Port for the dev server (default: 8181)")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk dev
  $ devicesdk dev --port 3000
  $ devicesdk dev --config ./devicesdk.custom.ts`,
	)
	.action(dev);

program
	.command("build")
	.description("Compile TypeScript entrypoints to JavaScript")
	.option("-d, --device <id>", "Build only a specific device")
	.option("-o, --outdir <path>", "Output directory (default: .devicesdk/build)")
	.option("--minify", "Minify output")
	.option("--sourcemap", "Generate source maps")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk build
  $ devicesdk build --device sensor-1 --minify
  $ devicesdk build --outdir dist/ --sourcemap`,
	)
	.action(build);

program
	.command("deploy")
	.description("Deploy scripts to the DeviceSDK API")
	.option("-d, --device <id>", "Deploy only a specific device")
	.option("-m, --message <text>", "Deployment message (version note)")
	.option("--dry-run", "Validate without uploading")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk deploy
  $ devicesdk deploy --device sensor-1 -m "Fix temperature drift"
  $ devicesdk deploy --dry-run
  $ devicesdk deploy --json | jq '.result.versions[].versionId'`,
	)
	.action(deploy);

program
	.command("logs [project-id] [device-id]")
	.description("View logs for a deployed device (defaults from devicesdk.ts)")
	.option("-f, --tail", "Continuously tail new log entries")
	.option("-n, --lines <number>", "Number of log lines to show", "50")
	.option(
		"--level <level>",
		"Filter by log level: log, info, warn, error, debug",
	)
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option(
		"--json",
		"Emit JSON. Non-tail: single { success, result } document. Tail: NDJSON, one event per line.",
	)
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk logs                                  # uses devicesdk.ts in current dir or any parent
  $ devicesdk logs sensor-1                         # multi-device project: pick one
  $ devicesdk logs my-project sensor-1 --tail
  $ devicesdk logs my-project sensor-1 --level error -n 200
  $ devicesdk logs --tail --json | jq             # NDJSON stream

More: https://devicesdk.com/docs/cli/logs/`,
	)
	.action((arg1, arg2, options) => {
		// One positional → treat as device-id (project from config).
		// Two positionals → [project-id, device-id].
		const projectId = arg2 !== undefined ? arg1 : undefined;
		const deviceId = arg2 !== undefined ? arg2 : arg1;
		return logs(projectId, deviceId, {
			tail: options.tail ?? false,
			lines: Number(options.lines),
			level: options.level,
			config: options.config,
			json: options.json,
		});
	});

program
	.command("flash <device-id>")
	.description("Download firmware and flash a device")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("-t, --timeout <ms>", "Time to wait for device (ms)", (value) =>
		parseInt(value, 10),
	)
	.option(
		"-p, --port <port>",
		"Serial port for ESP32 devices (e.g., /dev/cu.usbserial-0001)",
	)
	.option(
		"-b, --baud <rate>",
		"Baud rate for ESP32 flashing (default: 460800)",
		(value) => parseInt(value, 10),
	)
	.option(
		"--host <url>",
		"Download firmware from a custom host (e.g., http://192.168.0.1:9000)",
	)
	.option(
		"--before <method>",
		"Reset method before flashing (default_reset or no_reset)",
	)
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk flash pico-w-device
  $ devicesdk flash esp32-device --port /dev/cu.usbserial-0001
  $ devicesdk flash pico-w-device --host http://192.168.1.50:9000`,
	)
	.action((deviceId, options) => flash(deviceId, options));

program
	.command("status")
	.description("Show live connection status for all devices in a project")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-d, --device <id>", "Show status for a single device only")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk status
  $ devicesdk status --project my-project
  $ devicesdk status --device sensor-1
  $ devicesdk status --json | jq '.result.devices[].connected'

More: https://devicesdk.com/docs/cli/status/`,
	)
	.action(status);

program
	.command("inspect <device-id>")
	.description(
		"Interactive hardware inspection — send commands to a connected device",
	)
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--project <id>", "Project ID (if no devicesdk.ts config)")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk inspect sensor-1
  $ devicesdk inspect sensor-1 --project my-project`,
	)
	.action((deviceId, options) => inspect(deviceId, options));

// Env var commands
const envCmd = program
	.command("env")
	.description("Manage project environment variables");

envCmd
	.command("set <pairs...>")
	.description("Set one or more env vars (KEY=VALUE format)")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk env set DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
  $ devicesdk env set API_KEY=abc123 DEBUG=true
  $ devicesdk env set API_KEY=abc123 --json`,
	)
	.action((pairs, options) => envSet(pairs, options));

envCmd
	.command("list")
	.description("List env var keys for the project (values are never shown)")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Note: env var *values* are never returned by the API. Read them inside your
device script with \`await this.env.VARS.get("KEY")\`.

Examples:
  $ devicesdk env list
  $ devicesdk env list --project my-project
  $ devicesdk env list --json

More: https://devicesdk.com/docs/concepts/env-vars/`,
	)
	.action((options) => envList(options));

envCmd
	.command("unset <key>")
	.description("Remove an env var")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--json", "Emit a machine-readable JSON document and exit")
	.addHelpText(
		"after",
		`
Examples:
  $ devicesdk env unset DISCORD_WEBHOOK
  $ devicesdk env unset DISCORD_WEBHOOK --json`,
	)
	.action((key, options) => envUnset(key, options));

program.parse(process.argv);

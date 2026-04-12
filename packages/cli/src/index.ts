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
	.version(pkg.version);

// Auth commands
program
	.command("login")
	.description("Authenticate the CLI with the DeviceSDK API")
	.option("-v, --verbose", "Enable verbose output")
	.action(login);

program
	.command("logout")
	.description("Remove stored credentials")
	.action(logout);

program
	.command("whoami")
	.description("Display current authenticated user")
	.action(whoami);

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
	.action((projectId, options) => init(projectId, options));

// Development commands
program
	.command("dev")
	.description("Run the local development server")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("-p, --port <port>", "Port for the dev server (default: 8181)")
	.action(dev);

program
	.command("build")
	.description("Compile TypeScript entrypoints to JavaScript")
	.option("-d, --device <id>", "Build only a specific device")
	.option("-o, --outdir <path>", "Output directory (default: .devicesdk/build)")
	.option("--minify", "Minify output")
	.option("--sourcemap", "Generate source maps")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.action(build);

program
	.command("deploy")
	.description("Deploy scripts to the DeviceSDK API")
	.option("-d, --device <id>", "Deploy only a specific device")
	.option("-m, --message <text>", "Deployment message (version note)")
	.option("--dry-run", "Validate without uploading")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.action(deploy);

program
	.command("logs <project-id> <device-id>")
	.description("View logs for a deployed device")
	.option("-f, --tail", "Continuously tail new log entries")
	.option("-n, --lines <number>", "Number of log lines to show", "50")
	.option(
		"--level <level>",
		"Filter by log level: log, info, warn, error, debug",
	)
	.action((projectId, deviceId, options) =>
		logs(projectId, deviceId, {
			tail: options.tail ?? false,
			lines: Number(options.lines),
			level: options.level,
		}),
	);

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
	.action((deviceId, options) => flash(deviceId, options));

program
	.command("status")
	.description("Show live connection status for all devices in a project")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-d, --device <id>", "Show status for a single device only")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.action(status);

program
	.command("inspect <device-id>")
	.description(
		"Interactive hardware inspection — send commands to a connected device",
	)
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.option("--project <id>", "Project ID (if no devicesdk.ts config)")
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
	.action((pairs, options) => envSet(pairs, options));

envCmd
	.command("list")
	.description("List env var keys for the project (values are never shown)")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.action((options) => envList(options));

envCmd
	.command("unset <key>")
	.description("Remove an env var")
	.option("-p, --project <id>", "Project ID (overrides devicesdk.ts)")
	.option("-c, --config <path>", "Path to the devicesdk.ts config file")
	.action((key, options) => envUnset(key, options));

program.parse(process.argv);

#!/usr/bin/env node

import { Command } from "commander";
import build from "./commands/build.js";
import deploy from "./commands/deploy.js";
import dev from "./commands/dev.js";
import flash from "./commands/flash.js";
import init from "./commands/init.js";
import login from "./commands/login.js";
import logout from "./commands/logout.js";
import whoami from "./commands/whoami.js";

export { defineConfig } from "./config.js";

const program = new Command();

program
	.name("devicesdk")
	.description(
		"CLI tool for developing and deploying DeviceSDK IoT applications",
	)
	.version("0.1.0");

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
	.action((deviceId, options) => flash(deviceId, options));

program.parse(process.argv);

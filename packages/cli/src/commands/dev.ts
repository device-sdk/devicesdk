import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";
import * as esbuild from "esbuild";
import { type ExecaChildProcess, type ExecaError, execa } from "execa";
import type { DeviceConfig } from "../config.js";
import { EXIT } from "../exitCodes.js";
import { getConfigDir, loadConfig } from "../utils.js";
import { generateDeviceTypes } from "./build.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 8181;

type PortProbeResult = "available" | "in_use" | "denied";

/**
 * Probes whether a port can be bound. Distinguishes EADDRINUSE (fall back to
 * the next free port) from every other bind failure (EACCES on privileged
 * ports, firewalls, etc.) which is reported and fatal.
 */
export const probePort = (port: number): Promise<PortProbeResult> =>
	new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", (err: NodeJS.ErrnoException) => {
			resolve(err.code === "EADDRINUSE" ? "in_use" : "denied");
		});
		server.once("listening", () => {
			server.close();
			resolve("available");
		});
		server.listen(port);
	});

export const isPortAvailable = (port: number): Promise<boolean> =>
	probePort(port).then((result) => result === "available");

/** Parses --port; NaN when the value is not an integer in 1..65535. */
export const parseDevPort = (raw: string | undefined): number => {
	if (raw === undefined) return DEFAULT_PORT;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) return Number.NaN;
	return port;
};

interface DeviceWithClass extends DeviceConfig {
	className: string;
	resolvedEntrypoint: string;
}

function sanitizeCapnpId(s: string): string {
	return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

// workerd's `process.env` is populated from the worker's TEXT bindings, never
// from the workerd process's own environment. The CLI's env vars are
// enumerated here into per-var text bindings (binding name = env var name) on
// the dev worker so the device bridge AND `process.env` (via
// nodejs_compat_populate_process_env) both see them in `devicesdk dev`. A
// marker binding lists the carried keys so the bridge can enumerate them; the
// count is capped so the generated config stays small and predictable.
const MAX_SIMULATED_ENV_VARS = 100;
const VARS_KEYS_BINDING = "DEVICESDK_VARS_KEYS";

// capnp text literals use C-style escapes. JSON-escaped strings only contain
// `\` and `"`, but raw env values may contain control characters too.
function escapeCapnpText(s: string): string {
	let out = "";
	for (const ch of s) {
		if (ch === "\\") out += "\\\\";
		else if (ch === '"') out += '\\"';
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		else if (ch.charCodeAt(0) < 0x20) {
			out += `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;
		} else {
			out += ch;
		}
	}
	return out;
}

function buildEnvVarBindings(): string {
	// A user env var named exactly like the marker would be ambiguous with
	// the keys list - it is excluded from the simulated VARS view.
	const entries = Object.entries(process.env).filter(
		(entry): entry is [string, string] =>
			entry[1] !== undefined && entry[0] !== VARS_KEYS_BINDING,
	);
	const keys = entries.slice(0, MAX_SIMULATED_ENV_VARS).map(([key]) => key);
	const bindings = [
		`(name = "${VARS_KEYS_BINDING}", text = "${escapeCapnpText(JSON.stringify(keys))}")`,
		...entries
			.slice(0, MAX_SIMULATED_ENV_VARS)
			.map(
				([key, value]) =>
					`(name = "${escapeCapnpText(key)}", text = "${escapeCapnpText(value)}")`,
			),
	];
	return bindings.join(",");
}

const generateCapnpConfig = (
	devices: Record<string, DeviceWithClass>,
	entrypointPath: string,
	simulatorAssetsPath: string,
	port: number,
): string => {
	const durableObjects = Object.keys(devices)
		.map(
			(key) => `
      (className = "DeviceBridge_${sanitizeCapnpId(key)}", enableSql = true)
    `,
		)
		.join(",");

	const doBindings = Object.keys(devices)
		.map(
			(key) => `
        (name = "${sanitizeCapnpId(key)}", durableObjectNamespace = (className = "DeviceBridge_${sanitizeCapnpId(key)}", serviceName = "main"))
      `,
		)
		.join(",");

	const deviceIds = JSON.stringify(Object.keys(devices));

	return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .devWorker),
    (name = "simulator", worker = .simulatorWorker),
    (name = "simulator-assets", disk = (
      path = "${simulatorAssetsPath}",
      writable = false
    ))
  ],

  sockets = [ ( name = "http", address = "*:${port}", http = (), service = "simulator" ) ],
);

const devWorker :Workerd.Worker = (
  compatibilityDate = "2025-01-01",
  # nodejs_compat_populate_process_env fills process.env from the worker
  # text bindings (the compat date 2025-01-01 predates that default).
  compatibilityFlags = [ "nodejs_compat", "nodejs_compat_populate_process_env" ],
  modules = [
    (name = "entry.js", esModule = embed "${entrypointPath}"),
  ],

  bindings = [${buildEnvVarBindings()}],

  durableObjectNamespaces = [${durableObjects}],
  durableObjectStorage = (inMemory = void),
);

const simulatorWorker :Workerd.Worker = (
    compatibilityDate = "2025-01-01",

    modules = [
        (name = "simulator.js", esModule = embed "./simulator.js"),
    ],

    bindings = [
    (
      name = "ASSETS",
      service = (
        name = "simulator-assets"
      )
    ),
    (
      name = "DEVICES",
      text = "${deviceIds.replace(/"/g, '\\"')}"
    ),
    ${doBindings}],
);`;
};

const generateWorkerdEntrypoint = async (
	devices: Record<string, DeviceWithClass>,
	tmpDir: string,
): Promise<string> => {
	const entrypointPath = path.join(tmpDir, "_workerd_entry.ts");

	const userImports = Object.values(devices)
		.map(
			(device) =>
				`import { ${device.className} } from '${device.resolvedEntrypoint}';`,
		)
		.join("\n");

	const bridgeExports = Object.entries(devices)
		.map(
			([key, device]) =>
				`export const DeviceBridge_${sanitizeCapnpId(key)} = createDeviceBridge(${device.className});`,
		)
		.join("\n");

	const content = `import { createDeviceBridge } from '${path.resolve(__dirname, "../simulator/deviceBridge.js")}';
${userImports}
${bridgeExports}
`;
	await fs.writeFile(entrypointPath, content);
	return entrypointPath;
};

const buildEntryPoint = async (
	entrypointPath: string,
	outfile: string,
	extraPlugins: esbuild.Plugin[] = [],
) => {
	await esbuild.build({
		entryPoints: [entrypointPath],
		bundle: true,
		outfile,
		format: "esm",
		platform: "node",
		external: ["cloudflare:workers"],
		plugins: extraPlugins,
	});
};

// Files `dev` writes into the shared .devicesdk dir. build/deploy own
// .devicesdk/build/ (bundles + compiled configs) and flash owns
// .devicesdk/firmware/ - Ctrl-C on dev must never delete those.
const DEV_TMP_FILES = [
	"bundle.js",
	"config.capnp",
	"simulator.js",
	"_workerd_entry.ts",
];

export const removeDevFiles = async (tmpDir: string): Promise<void> => {
	await Promise.all(
		DEV_TMP_FILES.map((file) =>
			fs.rm(path.join(tmpDir, file), { force: true }).catch(() => {}),
		),
	);
};

const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BASE_DELAY_MS = 1_000;
const RESTART_MAX_DELAY_MS = 30_000;
const RESTART_MIN_UPTIME_MS = 10_000;

const dev = async (options: { config?: string; port?: string }) => {
	// Resolve the config directory with the same parent-walk discovery the
	// other commands use (utils.getConfigDir), so running from a project
	// subdirectory finds the project root instead of erroring with "Main file
	// not found" and writing devicesdk-env.d.ts into the subdir. An explicit
	// --config keeps its own existence check for a clearer error.
	let configDir: string;
	if (options.config) {
		let configPath = path.resolve(process.cwd(), options.config);
		try {
			const stats = await fs.stat(configPath);
			if (stats.isDirectory()) {
				configPath = path.join(configPath, "devicesdk.ts");
			}
		} catch {
			console.error(
				`Error: Could not find ${configPath}. Make sure the file or directory exists.`,
			);
			process.exit(EXIT.CONFIG_LOAD_FAILED);
		}
		configDir = path.dirname(configPath);
	} else {
		configDir = getConfigDir();
	}
	const tmpDir = path.join(configDir, ".devicesdk");

	let workerdProcess: ExecaChildProcess | null = null;
	let workerdStartedAt: number | null = null;
	let isRestarting = false;
	let isExiting = false;
	let restartAttempts = 0;
	let restartTimer: ReturnType<typeof setTimeout> | null = null;
	let rebuildQueued = false;

	const cleanup = async () => {
		isExiting = true;
		if (restartTimer) {
			clearTimeout(restartTimer);
			restartTimer = null;
		}
		if (workerdProcess) {
			// Kill before nulling: once workerdProcess is null, cleanup can no
			// longer reach the process, and a SIGINT landing mid-restart
			// would orphan the old workerd on the port.
			workerdProcess.kill("SIGTERM");
			try {
				await workerdProcess;
			} catch {
				// Expected - process was killed
			}
			workerdProcess = null;
		}
		await removeDevFiles(tmpDir);
	};

	const shutdown = async () => {
		console.log("\nShutting down devicesdk...");
		await cleanup();
		process.exit(EXIT.SUCCESS);
	};

	process.on("SIGINT", () => {
		void shutdown();
	});
	process.on("SIGTERM", () => {
		void shutdown();
	});

	try {
		const config = await loadConfig(options.config);

		// Generate inter-device RPC type definitions
		await generateDeviceTypes(config, configDir);

		// Convert devices to DeviceWithClass format
		const devicesWithClass: Record<string, DeviceWithClass> = {};
		for (const [deviceId, device] of Object.entries(config.devices)) {
			devicesWithClass[deviceId] = {
				...device,
				className: device.className,
				resolvedEntrypoint: path.resolve(configDir, device.main),
			};
		}

		console.log("Loaded devices:");
		for (const deviceName of Object.keys(devicesWithClass)) {
			console.log(`  - ${deviceName}`);
		}

		await fs.mkdir(tmpDir, { recursive: true });

		// Resolve simulator assets path.
		// Precedence: DEVICESDK_SIMULATOR_ASSETS_PATH override > packaged assets > monorepo fallback.
		let simulatorAssetsPath: string;
		const envOverride = process.env.DEVICESDK_SIMULATOR_ASSETS_PATH;
		if (envOverride) {
			simulatorAssetsPath = path.resolve(envOverride);
			try {
				await fs.access(simulatorAssetsPath);
			} catch {
				console.error(
					`Error: DEVICESDK_SIMULATOR_ASSETS_PATH points to a missing directory: ${simulatorAssetsPath}`,
				);
				process.exit(EXIT.GENERIC);
			}
		} else {
			simulatorAssetsPath = path.resolve(__dirname, "../simulator/assets");
			try {
				await fs.access(simulatorAssetsPath);
			} catch {
				// Fallback: dev path when running from source in the monorepo
				simulatorAssetsPath = path.resolve(
					__dirname,
					"../../../../apps/simulation/dist",
				);
				try {
					await fs.access(simulatorAssetsPath);
				} catch {
					console.error(
						"Error: Simulator assets not found. Run `pnpm build --filter @devicesdk/simulation` first, or set DEVICESDK_SIMULATOR_ASSETS_PATH to a built assets directory.",
					);
					process.exit(EXIT.GENERIC);
				}
			}
		}

		const port = parseDevPort(options.port);
		if (Number.isNaN(port)) {
			console.error(
				`Error: --port must be an integer between 1 and 65535 (got "${options.port}").`,
			);
			process.exit(EXIT.CONFIG_INVALID);
		}

		const initialProbe = await probePort(port);
		if (initialProbe === "denied") {
			console.error(
				`Error: cannot bind to port ${port} - permission denied. Privileged ports (below 1024) need root; check firewall rules.`,
			);
			process.exit(EXIT.GENERIC);
		}
		let resolvedPort = port;
		if (initialProbe === "in_use") {
			const original = port;
			// Scan upward for the next genuinely-free port. A single random pick
			// can itself be in use, which would crash `workerd serve` on bind.
			let candidate = -1;
			for (let p = original + 1; p <= 65535; p++) {
				const result = await probePort(p);
				if (result === "available") {
					candidate = p;
					break;
				}
				if (result === "denied") {
					console.error(
						`Error: cannot bind to port ${p} - permission denied. Privileged ports (below 1024) need root; check firewall rules.`,
					);
					process.exit(EXIT.GENERIC);
				}
			}
			if (candidate === -1) {
				console.error(`Error: no free port available above ${original}.`);
				process.exit(EXIT.GENERIC);
			}
			resolvedPort = candidate;
			console.log(`Port ${original} is in use, using ${resolvedPort} instead.`);
		}

		const buildAndStart = async () => {
			// Kill existing workerd process and wait for it to exit
			if (workerdProcess) {
				// Kill before clearing the reference so a SIGINT landing in
				// this window can still reach the process via cleanup.
				workerdProcess.kill("SIGTERM");
				const proc = workerdProcess;
				workerdProcess = null;
				try {
					await proc;
				} catch {
					// Expected - process was killed
				}
			}

			const entrypointPath = await generateWorkerdEntrypoint(
				devicesWithClass,
				tmpDir,
			);
			const outfile = path.join(tmpDir, "bundle.js");
			await buildEntryPoint(entrypointPath, outfile);

			const simulatorWorkerPath = path.resolve(
				__dirname,
				"../simulator/worker.js",
			);

			// Check if the compiled worker.js exists; if not, try building from .ts
			let simulatorSourcePath: string;
			try {
				await fs.access(simulatorWorkerPath);
				simulatorSourcePath = simulatorWorkerPath;
			} catch {
				simulatorSourcePath = path.resolve(__dirname, "../simulator/worker.ts");
			}

			const simulatorOutfile = path.join(tmpDir, "simulator.js");
			await buildEntryPoint(simulatorSourcePath, simulatorOutfile, [
				{
					name: "raw-loader",
					setup(build) {
						build.onResolve({ filter: /\?raw$/ }, (args) => ({
							path: path.isAbsolute(args.path)
								? args.path.slice(0, -4)
								: path.join(args.resolveDir, args.path.slice(0, -4)),
							namespace: "raw-loader",
						}));
						build.onLoad(
							{ filter: /.*/, namespace: "raw-loader" },
							async (args) => ({
								contents: await fs.readFile(args.path),
								loader: "text",
							}),
						);
					},
				},
			]);

			const capnpConfig = generateCapnpConfig(
				devicesWithClass,
				"bundle.js",
				simulatorAssetsPath,
				resolvedPort,
			);
			const capnpPath = path.join(tmpDir, "config.capnp");
			await fs.writeFile(capnpPath, capnpConfig);

			console.log(
				`\nStarting devicesdk on http://localhost:${resolvedPort}...\n`,
			);

			workerdProcess = execa(
				"workerd",
				["serve", "config.capnp", "--verbose"],
				{
					stdio: "inherit",
					cwd: tmpDir,
				},
			);
			workerdStartedAt = Date.now();

			workerdProcess.catch((error: ExecaError) => {
				if (isExiting) return;
				if (error.signal === "SIGTERM" && isRestarting) {
					// Expected during restart
					return;
				}
				if (error.signal === "SIGINT") {
					// User pressed Ctrl+C
					return;
				}
				console.error("\nworkerd exited unexpectedly:", error.message);
				scheduleRestart();
			});
		};

		// Bounded restart with exponential backoff. A workerd process that
		// crashes (runtime script error, workerd bug) is restarted instead of
		// leaving `dev` running dead - but never more than a few times in a
		// row. A process that ran for a while before dying resets the budget.
		const scheduleRestart = () => {
			if (isExiting) return;
			if (
				workerdStartedAt !== null &&
				Date.now() - workerdStartedAt >= RESTART_MIN_UPTIME_MS
			) {
				restartAttempts = 0;
			}
			restartAttempts++;
			if (restartAttempts > MAX_RESTART_ATTEMPTS) {
				console.error(
					`\nworkerd exited unexpectedly ${MAX_RESTART_ATTEMPTS} times in a row. ` +
						"Check the errors above and run `devicesdk dev` again.",
				);
				process.exit(EXIT.GENERIC);
			}
			const delay = Math.min(
				RESTART_BASE_DELAY_MS * 2 ** (restartAttempts - 1),
				RESTART_MAX_DELAY_MS,
			);
			console.log(
				`\nRestarting workerd in ${Math.round(delay / 1000)}s (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})...`,
			);
			restartTimer = setTimeout(() => {
				restartTimer = null;
				void startDevServer();
			}, delay);
		};

		// Shared build+start with the isRestarting guard. Both the watcher and
		// the crash-restart timer go through here, so a syntax error in the
		// user's script at any point (initial start included) prints the real
		// error and keeps watching for fixes instead of killing `dev`.
		const startDevServer = async () => {
			if (isRestarting) {
				rebuildQueued = true;
				return;
			}
			isRestarting = true;
			try {
				await buildAndStart();
			} catch (error) {
				console.error("Build failed:", (error as Error).message);
			} finally {
				isRestarting = false;
			}
		};

		// Initial build and start
		await startDevServer();

		// Watch user source files for changes
		const watchPaths = Object.values(devicesWithClass).map(
			(d) => d.resolvedEntrypoint,
		);
		const watchDirs = [...new Set(watchPaths.map((p) => path.dirname(p)))];

		const watcher = chokidar.watch(watchDirs, {
			// devicesdk-env.d.ts is regenerated by every build/dev run into a
			// watched dir - ignore it or each rebuild would re-trigger itself.
			ignored: /(^|[/\\])\.|node_modules|\.devicesdk|devicesdk-env\.d\.ts/,
			ignoreInitial: true,
		});

		watcher.on("change", async (changedPath) => {
			console.log(`\nFile changed: ${path.relative(configDir, changedPath)}`);

			if (isRestarting) {
				rebuildQueued = true;
				return;
			}

			console.log("Rebuilding...\n");
			// The user edited something - give the restart budget a fresh
			// start (the crash cause may be fixed now).
			restartAttempts = 0;
			await startDevServer();

			// If changes came in during rebuild, rebuild again
			if (rebuildQueued) {
				rebuildQueued = false;
				watcher.emit("change", changedPath);
			}
		});

		// Keep the process alive until SIGINT
		await new Promise(() => {});
	} catch (error) {
		const execaError = error as ExecaError;
		if (execaError.signal === "SIGINT") {
			console.log("\nShutting down devicesdk...");
		} else {
			console.error("\nAn unexpected error occurred.");
			if (error instanceof Error) {
				console.error(`\nError: ${(error as Error).message}`);
			} else {
				console.error(error);
			}
			console.error(
				"\nThis may be a bug. Please open an issue at: https://github.com/device-sdk/devicekit/issues/new",
			);
			process.exitCode = 1;
		}
		await cleanup();
	}
};

export default dev;

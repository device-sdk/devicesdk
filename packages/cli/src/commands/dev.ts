import chokidar from "chokidar";
import * as esbuild from "esbuild";
import { type ExecaChildProcess, type ExecaError, execa } from "execa";
import fs from "fs/promises";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { type DeviceConfig, DeviceSDKConfig } from "../config.js";
import { loadConfig } from "../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isPortAvailable = (port: number): Promise<boolean> => {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close();
			resolve(true);
		});
		server.listen(port);
	});
};

interface DeviceWithClass extends DeviceConfig {
	className: string;
	resolvedEntrypoint: string;
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
      (className = "DeviceBridge_${key}", enableSql = true)
    `,
		)
		.join(",");

	const doBindings = Object.keys(devices)
		.map(
			(key) => `
        (name = "${key}", durableObjectNamespace = (className = "DeviceBridge_${key}", serviceName = "main"))
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

  modules = [
    (name = "entry.js", esModule = embed "${entrypointPath}"),
  ],

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
				`export const DeviceBridge_${key} = createDeviceBridge(${device.className});`,
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

function toClassName(deviceId: string): string {
	return (
		deviceId
			.split("-")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join("") + "Device"
	);
}

const dev = async (options: { config?: string; port?: string }) => {
	const configPathOption = options.config || ".";
	let configPath = path.resolve(process.cwd(), configPathOption);

	try {
		const stats = await fs.stat(configPath);
		if (stats.isDirectory()) {
			configPath = path.join(configPath, "devicesdk.ts");
		}
	} catch (error) {
		console.error(
			`Error: Could not find ${configPath}. Make sure the file or directory exists.`,
		);
		process.exit(1);
	}
	const tmpDir = path.join(path.dirname(configPath), ".devicesdk");

	let workerdProcess: ExecaChildProcess | null = null;
	let isRestarting = false;

	const cleanup = async () => {
		if (workerdProcess) {
			workerdProcess.kill("SIGTERM");
			workerdProcess = null;
		}
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	};

	process.on("SIGINT", async () => {
		console.log("\nShutting down devicesdk...");
		await cleanup();
		process.exit(0);
	});

	try {
		const config = await loadConfig(options.config);
		const configDir = path.dirname(configPath);

		// Convert devices to DeviceWithClass format
		const devicesWithClass: Record<string, DeviceWithClass> = {};
		for (const [deviceId, device] of Object.entries(config.devices)) {
			devicesWithClass[deviceId] = {
				...device,
				className: toClassName(deviceId),
				resolvedEntrypoint: path.resolve(configDir, device.main),
			};
		}

		console.log("Loaded devices:");
		for (const deviceName of Object.keys(devicesWithClass)) {
			console.log(`  - ${deviceName}`);
		}

		await fs.mkdir(tmpDir, { recursive: true });

		// Resolve simulator assets path
		let simulatorAssetsPath = path.resolve(
			__dirname,
			"../simulator/assets",
		);
		try {
			await fs.access(simulatorAssetsPath);
		} catch {
			// Fallback: dev path when running from source
			simulatorAssetsPath = path.resolve(
				__dirname,
				"../../../../apps/simulation/dist",
			);
			try {
				await fs.access(simulatorAssetsPath);
			} catch {
				console.error(
					"Error: Simulator assets not found. Run `pnpm build --filter @devicesdk/simulation` first.",
				);
				process.exit(1);
			}
		}

		let port = options.port ? Number.parseInt(options.port, 10) : 8181;
		if (!(await isPortAvailable(port))) {
			const original = port;
			port = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
			console.log(
				`Port ${original} is in use, using ${port} instead.`,
			);
		}

		const buildAndStart = async () => {
			// Kill existing workerd process and wait for it to exit
			if (workerdProcess) {
				const proc = workerdProcess;
				workerdProcess = null;
				proc.kill("SIGTERM");
				try {
					await proc;
				} catch {
					// Expected — process was killed
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
				simulatorSourcePath = path.resolve(
					__dirname,
					"../simulator/worker.ts",
				);
			}

			const simulatorOutfile = path.join(tmpDir, "simulator.js");
			await buildEntryPoint(simulatorSourcePath, simulatorOutfile, [
				{
					name: "raw-loader",
					setup(build) {
						build.onResolve({ filter: /\?raw$/ }, (args) => ({
							path: path.isAbsolute(args.path)
								? args.path.slice(0, -4)
								: path.join(
										args.resolveDir,
										args.path.slice(0, -4),
									),
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
				port,
			);
			const capnpPath = path.join(tmpDir, "config.capnp");
			await fs.writeFile(capnpPath, capnpConfig);

			console.log(
				`\nStarting devicesdk on http://localhost:${port}...\n`,
			);

			workerdProcess = execa(
				"workerd",
				["serve", "config.capnp", "--verbose"],
				{
					stdio: "inherit",
					cwd: tmpDir,
				},
			);

			workerdProcess.catch((error: ExecaError) => {
				if (error.signal === "SIGTERM" && isRestarting) {
					// Expected during restart
					return;
				}
				if (error.signal === "SIGINT") {
					// User pressed Ctrl+C
					return;
				}
				console.error("\nworkerd exited unexpectedly:", error.message);
			});
		};

		// Initial build and start
		await buildAndStart();

		// Watch user source files for changes
		const watchPaths = Object.values(devicesWithClass).map(
			(d) => d.resolvedEntrypoint,
		);
		const watchDirs = [
			...new Set(watchPaths.map((p) => path.dirname(p))),
		];

		let rebuildQueued = false;
		const watcher = chokidar.watch(watchDirs, {
			ignored: /(^|[\/\\])\.|node_modules|\.devicesdk/,
			ignoreInitial: true,
		});

		watcher.on("change", async (changedPath) => {
			console.log(
				`\nFile changed: ${path.relative(configDir, changedPath)}`,
			);

			if (isRestarting) {
				rebuildQueued = true;
				return;
			}

			isRestarting = true;
			console.log("Rebuilding...\n");

			try {
				await buildAndStart();
			} catch (error) {
				console.error("Rebuild failed:", (error as Error).message);
			} finally {
				isRestarting = false;
			}

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

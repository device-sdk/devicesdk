import * as esbuild from "esbuild";
import { type ExecaError, execa } from "execa";
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
      (className = "${devices[key].className}", enableSql = true)
    `,
		)
		.join(",");

	const bindings = Object.entries(devices)
		.map(
			([key, value]) => `
        (name = "${key}", durableObjectNamespace = (className = "${value.className}", serviceName = "main"))
      `,
		)
		.join(",");

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

    bindings = [(
      name = "ASSETS",
      service = (
        name = "simulator-assets"
      )
    ),
    ${bindings}],
);`;
};

const generateWorkerdEntrypoint = async (
	devices: Record<string, DeviceWithClass>,
	tmpDir: string,
): Promise<string> => {
	const entrypointPath = path.join(tmpDir, "_workerd_entry.ts");
	const imports = Object.values(devices)
		.map(
			(device) =>
				`import { ${device.className} as ${device.className} } from '${device.resolvedEntrypoint}';`,
		)
		.join("\n");
	const exports = `export { ${Object.values(devices)
		.map((device) => device.className)
		.join(", ")} };`;
	const content = `${imports}\n${exports}`;
	await fs.writeFile(entrypointPath, content);
	return entrypointPath;
};

const buildEntryPoint = async (
	entrypointPath: string,
	outfile: string,
	extraLoaders: esbuild.Plugin[] = [],
) => {
	await esbuild.build({
		entryPoints: [entrypointPath],
		bundle: true,
		outfile,
		format: "esm",
		platform: "node",
		plugins: extraLoaders,
	});
};

function toClassName(deviceId: string): string {
	// Convert device-id to DeviceId class name
	return (
		deviceId
			.split("-")
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join("") + "Device"
	);
}

const dev = async (options: { config?: string }) => {
	console.log("devicesdk dev: coming soon. Thanks for your patience!");
	return;

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
		Object.keys(devicesWithClass).forEach((deviceName) => {
			console.log(`- ${deviceName}`);
		});

		await fs.mkdir(tmpDir, { recursive: true });

		const entrypointPath = await generateWorkerdEntrypoint(
			devicesWithClass,
			tmpDir,
		);
		const outfile = path.join(tmpDir, "bundle.js");
		await buildEntryPoint(entrypointPath, outfile);

		const simulatorEntrypointPath = path.resolve(
			__dirname,
			"../simulator/worker.ts",
		);
		const simulatorOutfile = path.join(tmpDir, "simulator.js");
		await buildEntryPoint(simulatorEntrypointPath, simulatorOutfile, [
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

		let port = 8181;
		if (!(await isPortAvailable(port))) {
			port = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024;
		}

		// TODO: make this path dynamic
		const capnpConfig = generateCapnpConfig(
			devicesWithClass,
			"bundle.js",
			path.resolve(__dirname, "../simulator/assets"),
			port,
		);
		const capnpPath = path.join(tmpDir, "config.capnp");
		await fs.writeFile(capnpPath, capnpConfig);

		console.log(`
Starting devicesdk on http://localhost:${port}...
`);

		await execa("workerd", ["serve", "config.capnp", "--verbose"], {
			stdio: "inherit",
			cwd: tmpDir,
		});
	} catch (error) {
		const execaError = error as ExecaError;
		if (execaError.signal === "SIGINT") {
			console.log("\nShutting down devicesdk...");
		} else {
			console.error("\n❌ An unexpected error occurred.");
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
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
			// Ignore errors on cleanup
		});
	}
};

export default dev;

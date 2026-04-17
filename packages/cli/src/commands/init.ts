import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { execa } from "execa";
import { createProject, DeviceSDKApiError } from "../api.js";
import { requireAuth } from "../credentials.js";

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

const TEMPLATES = {
	basic: {
		devices: {
			device: {
				entrypoint: "./src/devices/device.ts",
				name: "Main Device",
			},
		},
		deviceCode: `import { DeviceEntrypoint } from "@devicesdk/core";

export default class Device extends DeviceEntrypoint {
  async onMessage(message: any) {
    console.log("Received message:", message);
    return { status: "ok" };
  }
}
`,
	},
	"multi-device": {
		devices: {
			"sensor-1": {
				entrypoint: "./src/devices/sensor.ts",
				name: "Temperature Sensor",
			},
			controller: {
				entrypoint: "./src/devices/controller.ts",
				name: "Main Controller",
			},
		},
		deviceCode: `import { DeviceEntrypoint } from "@devicesdk/core";

export default class Device extends DeviceEntrypoint {
  async onMessage(message: any) {
    console.log("Received message:", message);
    return { status: "ok" };
  }
}
`,
	},
	empty: {
		devices: {},
		deviceCode: null,
	},
};

function generateConfigFile(
	projectId: string,
	devices: Record<
		string,
		{ entrypoint: string; name?: string; description?: string }
	>,
): string {
	const devicesStr = Object.entries(devices)
		.map(([key, value]) => {
			const props = [`      entrypoint: "${value.entrypoint}"`];
			if (value.name) props.push(`      name: "${value.name}"`);
			if (value.description)
				props.push(`      description: "${value.description}"`);
			return `    "${key}": {\n${props.join(",\n")},\n    }`;
		})
		.join(",\n");

	return `import { defineConfig } from "@devicesdk/cli";

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
				rootDir: "./src",
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

export default async function init(
	projectIdArg?: string,
	options: InitOptions = {},
): Promise<void> {
	const templateName = options.template || "basic";
	const template = TEMPLATES[templateName as keyof typeof TEMPLATES];

	if (!template) {
		console.error(`✗ Error: Unknown template "${templateName}"\n`);
		console.error("  Available templates: basic, multi-device, empty");
		process.exit(2);
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
		process.exit(1);
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

		// Generate device files
		if (template.deviceCode && Object.keys(template.devices).length > 0) {
			const srcDir = path.join(projectDir, "src", "devices");
			await fs.mkdir(srcDir, { recursive: true });

			for (const [, device] of Object.entries(template.devices)) {
				const devicePath = path.join(projectDir, device.entrypoint);
				const deviceDir = path.dirname(devicePath);
				await fs.mkdir(deviceDir, { recursive: true });

				try {
					await fs.access(devicePath);
				} catch {
					await fs.writeFile(devicePath, template.deviceCode);
					console.log(`✓ Generated ${device.entrypoint}`);
				}
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
  devicesdk deploy        # Deploy to production
`);
	} catch (error) {
		console.error("\n✗ Error: Failed to initialize project\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(1);
	}
}

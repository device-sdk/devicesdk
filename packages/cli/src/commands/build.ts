import fs from 'fs/promises';
import path from 'path';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'url';
import { DeviceSDKConfig, DeviceSDKConfigSchema } from '../config.js';
import { loadConfig } from '../utils.js';

interface BuildOptions {
  device?: string;
  outdir?: string;
  minify?: boolean;
  sourcemap?: boolean;
  config?: string;
}

const MAX_SCRIPT_SIZE = 1024 * 1024; // 1MB

async function buildDevice(
  deviceId: string,
  entrypoint: string,
  outdir: string,
  options: { minify?: boolean; sourcemap?: boolean }
): Promise<{ size: number; outfile: string }> {
  const outfile = path.join(outdir, `${deviceId}.js`);

  await esbuild.build({
    entryPoints: [entrypoint],
    bundle: true,
    outfile,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    conditions: ['workerd', 'worker', 'browser'],
    external: ['cloudflare:workers'],
    minify: options.minify || false,
    sourcemap: options.sourcemap || false,
  });

  const stats = await fs.stat(outfile);
  return { size: stats.size, outfile };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function build(options: BuildOptions = {}): Promise<void> {
  try {
    const config = await loadConfig(options.config);
    const configDir = path.dirname(options.config ? path.resolve(process.cwd(), options.config) : path.join(process.cwd(), 'devicesdk.ts'));
    const outdir = options.outdir
      ? path.resolve(process.cwd(), options.outdir)
      : path.join(configDir, '.devicesdk', 'build');

    // Create output directory
    await fs.mkdir(outdir, { recursive: true });

    // Filter devices if specific device requested
    let devicesToBuild = Object.entries(config.devices);
    if (options.device) {
      const device = config.devices[options.device];
      if (!device) {
        console.error(`✗ Error: Device "${options.device}" not found in config\n`);
        console.error(`  Available devices: ${Object.keys(config.devices).join(', ')}`);
        process.exit(5);
      }
      devicesToBuild = [[options.device, device]];
    }

    if (devicesToBuild.length === 0) {
      console.error('✗ Error: No devices configured\n');
      console.error('  Add devices to your devicesdk.ts configuration file.');
      process.exit(5);
    }

    let totalSize = 0;
    const results: Array<{ deviceId: string; size: number; error?: string }> = [];

    for (const [deviceId, device] of devicesToBuild) {
      const mainFile = path.resolve(configDir, device.main);

      // Check if main file exists
      try {
        await fs.access(mainFile);
      } catch {
        console.error(`✗ ${deviceId}: Main file not found: ${device.main}`);
        results.push({ deviceId, size: 0, error: 'Main file not found' });
        continue;
      }

      try {
        const { size } = await buildDevice(deviceId, mainFile, outdir, {
          minify: options.minify,
          sourcemap: options.sourcemap,
        });

        if (size > MAX_SCRIPT_SIZE) {
          console.error(`✗ ${deviceId}: Script exceeds maximum size of 1MB (${formatSize(size)})`);
          results.push({ deviceId, size, error: 'Script too large' });
          continue;
        }

        console.log(`✓ Built ${deviceId}.js (${formatSize(size)})`);
        results.push({ deviceId, size });
        totalSize += size;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`✗ ${deviceId}: Build failed - ${message}`);
        results.push({ deviceId, size: 0, error: message });
      }
    }

    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;

    console.log(`\nBuild complete: ${successCount} device${successCount !== 1 ? 's' : ''}, ${formatSize(totalSize)} total`);

    if (failCount > 0) {
      console.error(`\n${failCount} device${failCount !== 1 ? 's' : ''} failed to build`);
      process.exit(5);
    }
  } catch (error) {
    console.error('✗ Error: Build failed\n');
    if (error instanceof Error) {
      console.error(`  ${error.message}`);
    }
    process.exit(5);
  }
}

export { buildDevice, formatSize };

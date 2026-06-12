import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PID_FILE = path.resolve(__dirname, ".pids.json");
const DATA_DIR = path.resolve(__dirname, ".data");

export default async function globalTeardown() {
  if (fs.existsSync(PID_FILE)) {
    const pids = JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));

    for (const [, pid] of Object.entries(pids)) {
      try {
        // Kill the process group (negative PID kills the group)
        process.kill(-(pid as number), "SIGTERM");
      } catch {
        // Process may already be gone
      }
    }

    fs.unlinkSync(PID_FILE);
  }

  // Remove the throwaway server data dir so it never lingers between runs.
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

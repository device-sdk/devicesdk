import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const PID_FILE = path.resolve(__dirname, ".pids.json");

export default async function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return;

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

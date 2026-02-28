import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const API_PORT = 8787;
const DASHBOARD_PORT = 9000;
const API_DIR = path.resolve(__dirname, "../../../api");
const DASHBOARD_DIR = path.resolve(__dirname, "../..");
const PID_FILE = path.resolve(__dirname, ".pids.json");

async function waitForServer(
  url: string,
  timeoutMs: number = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok || resp.status === 401 || resp.status === 404) return;
    } catch {
      // server not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

export default async function globalSetup() {
  // 1. Apply D1 migrations
  execSync("npx wrangler d1 migrations apply DB --local", {
    cwd: API_DIR,
    stdio: "pipe",
  });

  // 2. Seed test data
  const now = Date.now();
  const expires = now + 86400000;
  const seedSQL = `
    DELETE FROM device_scripts;
    DELETE FROM devices;
    DELETE FROM tokens;
    DELETE FROM user_sessions;
    DELETE FROM projects;
    DELETE FROM user;

    INSERT OR IGNORE INTO user (id, name, email, verified_email, picture, created_at)
    VALUES ('user-1', 'Alice Johnson', 'alice@example.com', 1, 'https://example.com/alice.jpg', ${now});

    INSERT OR IGNORE INTO user_sessions (user_id, token, created_at, expires_at)
    VALUES ('user-1', 'test-session-token', ${now}, ${expires});

    INSERT OR IGNORE INTO projects (id, user_id, project_slug, name, description, created_at)
    VALUES ('proj-1', 'user-1', 'smart-home', 'Smart Home', 'IoT smart home automation project', ${now});

    INSERT OR IGNORE INTO projects (id, user_id, project_slug, name, description, created_at)
    VALUES ('proj-2', 'user-1', 'weather-station', 'Weather Station', 'IoT weather monitoring system', ${now});
  `.trim();

  execSync(
    `npx wrangler d1 execute DB --local --command "${seedSQL.replace(/"/g, '\\"')}"`,
    { cwd: API_DIR, stdio: "pipe" },
  );

  // 3. Start API server
  const apiProcess = spawn(
    "npx",
    ["wrangler", "dev", "--port", String(API_PORT)],
    {
      cwd: API_DIR,
      stdio: "pipe",
      env: { ...process.env, ENV: "local" },
      detached: true,
    },
  );

  // 4. Start dashboard dev server (disable auto-open)
  const dashProcess = spawn("npx", ["quasar", "dev"], {
    cwd: DASHBOARD_DIR,
    stdio: "pipe",
    env: { ...process.env, BROWSER: "none" },
    detached: true,
  });

  // Save PIDs for teardown
  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({
      api: apiProcess.pid,
      dashboard: dashProcess.pid,
    }),
  );

  // 5. Wait for servers
  await waitForServer(`http://localhost:${API_PORT}/v1/user/me`);
  await waitForServer(`http://localhost:${DASHBOARD_PORT}`);
}

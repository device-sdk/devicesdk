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
  timeoutMs: number = 120000,
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

function killExistingServers() {
  if (!fs.existsSync(PID_FILE)) return;
  try {
    const pids = JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));
    for (const [, pid] of Object.entries(pids)) {
      try {
        process.kill(-(pid as number), "SIGTERM");
      } catch {
        // Process already gone
      }
    }
  } catch {
    // Ignore errors reading stale PID file
  }
  fs.unlinkSync(PID_FILE);
}

export default async function globalSetup() {
  // Kill any leftover servers from previous runs
  killExistingServers();

  // 1. Apply D1 migrations (idempotent)
  execSync("npx wrangler d1 migrations apply DB --local", {
    cwd: API_DIR,
    stdio: "pipe",
  });

  // 2. Start API server
  // stdio: inherit forwards wrangler's output to the parent process so CI logs
  // show startup errors. Using "pipe" without consuming the streams causes the
  // child to block when the pipe buffer fills.
  const apiProcess = spawn(
    "npx",
    ["wrangler", "dev", "--port", String(API_PORT)],
    { cwd: API_DIR, stdio: ["ignore", "inherit", "inherit"], detached: true },
  );
  apiProcess.on("exit", (code, signal) => {
    console.error(
      `[e2e] wrangler dev exited unexpectedly code=${code} signal=${signal}`,
    );
  });

  // 3. Start dashboard dev server
  const dashProcess = spawn("npx", ["quasar", "dev"], {
    cwd: DASHBOARD_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, BROWSER: "none" },
    detached: true,
  });
  dashProcess.on("exit", (code, signal) => {
    console.error(
      `[e2e] quasar dev exited unexpectedly code=${code} signal=${signal}`,
    );
  });

  // Save PIDs for teardown
  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({ api: apiProcess.pid, dashboard: dashProcess.pid }),
  );

  // 4. Wait for API server to be ready
  await waitForServer(`http://localhost:${API_PORT}/v1/user/me`);

  // 5. Seed test data AFTER API server starts (ensures same DB instance)
  const now = Date.now();
  const expires = now + 86400000;
  const seedSQL = [
    "DELETE FROM rate_limits;",
    "DELETE FROM device_scripts;",
    "DELETE FROM devices;",
    "DELETE FROM tokens;",
    "DELETE FROM user_sessions;",
    "DELETE FROM projects;",
    "DELETE FROM user;",
    "",
    `INSERT INTO user (id, name, email, verified_email, picture, created_at, plan) VALUES ('user-1', 'Alice Johnson', 'alice@example.com', 1, 'https://example.com/alice.jpg', ${now}, 'paid');`,
    `INSERT INTO user_sessions (user_id, token, created_at, expires_at) VALUES ('user-1', 'test-session-token', ${now}, ${expires});`,
    `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-1', 'user-1', 'smart-home', 'Smart Home', 'IoT smart home automation project', ${now});`,
    `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-2', 'user-1', 'weather-station', 'Weather Station', 'IoT weather monitoring system', ${now});`,

    // Devices for proj-1 (smart-home)
    `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-1', 'proj-1', 'temp-sensor', 'Temperature Sensor', 'Living room temperature monitor', NULL, NULL, ${now}, ${now});`,
    `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-2', 'proj-1', 'led-controller', 'LED Controller', 'Kitchen LED strip controller', NULL, NULL, ${now}, ${now});`,

    // Deletable project with a device
    `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-3', 'user-1', 'deletable-project', 'Deletable Project', 'Project for delete testing', ${now});`,
    `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-3', 'proj-3', 'deletable-device', 'Deletable Device', 'Device for delete testing', NULL, NULL, ${now}, ${now});`,

    // Token for delete testing
    `INSERT INTO tokens (id, user_id, token, created_at, description, managed) VALUES ('tok-1', 'user-1', 'dsdk_testtoken1234567890abcdef', ${now}, 'Test token for E2E', 0);`,
  ].join("\n");

  const sqlFile = path.resolve(__dirname, ".seed.sql");
  fs.writeFileSync(sqlFile, seedSQL);
  try {
    execSync(`npx wrangler d1 execute DB --local --file="${sqlFile}"`, {
      cwd: API_DIR,
      stdio: "pipe",
    });
  } catch (err: unknown) {
    const error = err as { stderr?: string; stdout?: string };
    console.error("[e2e] Seed failed:", error.stderr || error.stdout);
    throw err;
  } finally {
    fs.unlinkSync(sqlFile);
  }

  // 6. Verify seed data is accessible through the API
  const verifyResp = await fetch(`http://localhost:${API_PORT}/v1/projects`, {
    headers: { Authorization: "Bearer test-session-token" },
  });
  if (!verifyResp.ok) {
    const body = await verifyResp.text();
    throw new Error(
      `[e2e] Seed verification failed (${verifyResp.status}): ${body}`,
    );
  }

  // 7. Wait for dashboard
  await waitForServer(`http://localhost:${DASHBOARD_PORT}`);
}

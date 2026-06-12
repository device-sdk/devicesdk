import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// The Bun server defaults to 8080 (which is also the dashboard's dev API-host
// default). Override with E2E_API_PORT when 8080 is taken locally; the explicit
// VITE_API_HOST below keeps the dashboard pointed at whichever port we pick.
const API_PORT = Number(process.env.E2E_API_PORT) || 8080;
const API_HOST = `http://localhost:${API_PORT}`;
const DASHBOARD_PORT = 9000;
const SERVER_DIR = path.resolve(__dirname, "../../../server"); // apps/server
const DASHBOARD_DIR = path.resolve(__dirname, "../.."); // apps/dashboard
const DATA_DIR = path.resolve(__dirname, ".data"); // throwaway server state
const DB_PATH = path.join(DATA_DIR, "devicesdk.sqlite");
const SEED_SCRIPT = path.resolve(__dirname, "seed.ts");
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

  // Start from a clean data dir so the seed is deterministic. The server
  // recreates it and applies all migrations on boot.
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  // 1. Start the Bun server (creates the SQLite DB + applies migrations on boot).
  // stdio: inherit forwards the server's output to the parent process so CI
  // logs show startup errors. Using "pipe" without consuming the streams would
  // block the child once the pipe buffer fills.
  const apiProcess = spawn("bun", ["run", "src/server.ts"], {
    cwd: SERVER_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      DATA_DIR,
      ENV: "local",
      ALLOW_REGISTRATION: "true",
    },
  });
  apiProcess.on("exit", (code, signal) => {
    console.error(
      `[e2e] bun server exited unexpectedly code=${code} signal=${signal}`,
    );
  });

  // 2. Start dashboard dev server. VITE_API_HOST points it at our Bun server;
  // Vite's loadEnv picks up prefixed vars already present in process.env.
  const dashProcess = spawn("npx", ["quasar", "dev"], {
    cwd: DASHBOARD_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, BROWSER: "none", VITE_API_HOST: API_HOST },
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

  // 3. Wait for the API server to be ready (auth/status is a public endpoint).
  await waitForServer(`${API_HOST}/v1/auth/status`);

  // 4. Seed test data AFTER the server has migrated the DB. The seed runs in a
  // short-lived Bun process so it can open the same bun:sqlite database file.
  try {
    execSync(`bun run "${SEED_SCRIPT}"`, {
      cwd: SERVER_DIR,
      stdio: "pipe",
      env: { ...process.env, DSDK_E2E_DB: DB_PATH },
    });
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; stdout?: Buffer };
    console.error(
      "[e2e] Seed failed:",
      error.stderr?.toString() || error.stdout?.toString(),
    );
    throw err;
  }

  // 5. Verify seed data is accessible through the API (Bearer = session token).
  const verifyResp = await fetch(`${API_HOST}/v1/projects`, {
    headers: { Authorization: "Bearer test-session-token" },
  });
  if (!verifyResp.ok) {
    const body = await verifyResp.text();
    throw new Error(
      `[e2e] Seed verification failed (${verifyResp.status}): ${body}`,
    );
  }

  // 6. Wait for dashboard
  await waitForServer(`http://localhost:${DASHBOARD_PORT}`);
}

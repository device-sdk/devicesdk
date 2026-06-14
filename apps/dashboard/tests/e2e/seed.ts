// E2E seed script — run with Bun (`bun run seed.ts`), never Node.
//
// global-setup.ts starts the Bun server (which creates + migrates the SQLite
// database), then invokes this script to load deterministic test fixtures
// directly into that same database file. It replaces the old
// `wrangler d1 execute` seeding from the Cloudflare era.
//
// The DB path is passed via DSDK_E2E_DB so this file stays decoupled from the
// server's config resolution.
import { Database } from "bun:sqlite";

const dbPath = process.env.DSDK_E2E_DB;
if (!dbPath) {
  console.error("[e2e seed] DSDK_E2E_DB is not set");
  process.exit(1);
}

const now = Date.now();
const expires = now + 86_400_000; // +1 day

// Order matters: children are deleted before parents and inserted after them.
// Foreign keys are left off for the seed connection so the delete/insert order
// is the only thing keeping referential integrity — which it does.
const statements = [
  "DELETE FROM rate_limits;",
  "DELETE FROM device_scripts;",
  "DELETE FROM devices;",
  "DELETE FROM tokens;",
  "DELETE FROM user_sessions;",
  "DELETE FROM projects;",
  "DELETE FROM user;",

  // onboarding_completed = 1 so the dashboard skips the first-run wizard.
  `INSERT INTO user (id, name, email, verified_email, picture, created_at, onboarding_completed) VALUES ('user-1', 'Alice Johnson', 'alice@example.com', 1, 'https://example.com/alice.jpg', ${now}, 1);`,
  `INSERT INTO user_sessions (user_id, token, created_at, expires_at) VALUES ('user-1', 'test-session-token', ${now}, ${expires});`,

  `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-1', 'user-1', 'smart-home', 'Smart Home', 'IoT smart home automation project', ${now});`,
  `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-2', 'user-1', 'weather-station', 'Weather Station', 'IoT weather monitoring system', ${now});`,

  // Devices for proj-1 (smart-home)
  `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-1', 'proj-1', 'temp-sensor', 'Temperature Sensor', 'Living room temperature monitor', NULL, NULL, ${now}, ${now});`,
  `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-2', 'proj-1', 'led-controller', 'LED Controller', 'Kitchen LED strip controller', NULL, NULL, ${now}, ${now});`,

  // Deletable project with a device
  `INSERT INTO projects (id, user_id, project_slug, name, description, created_at) VALUES ('proj-3', 'user-1', 'deletable-project', 'Deletable Project', 'Project for delete testing', ${now});`,
  `INSERT INTO devices (id, project_id, device_slug, name, description, current_version_id, last_connected_at, created_at, updated_at) VALUES ('dev-3', 'proj-3', 'deletable-device', 'Deletable Device', 'Device for delete testing', NULL, NULL, ${now}, ${now});`,

  // Token for delete testing (token_hash is the legacy SHA-256 of the raw token).
  `INSERT INTO tokens (id, user_id, token_hash, last_four, created_at, description, managed) VALUES ('tok-1', 'user-1', 'b61118e521fadaf15846c57b5a50b124c63772c2b43be96b91d4525b929d8c84', 'cdef', ${now}, 'Test token for E2E', 0);`,
];

const db = new Database(dbPath);
try {
  db.exec("PRAGMA foreign_keys = OFF;");
  db.transaction(() => {
    for (const sql of statements) db.run(sql);
  })();
} finally {
  db.close();
}

console.log("[e2e seed] seeded test fixtures into", dbPath);

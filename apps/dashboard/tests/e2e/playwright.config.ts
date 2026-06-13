import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  // The dashboard dev server can be slow to serve chunks under CI load,
  // so allow one retry per test in CI without masking hard failures locally.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: "http://localhost:9000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: "auth.setup.ts",
    },
    {
      name: "e2e",
      dependencies: ["auth-setup"],
      use: {
        storageState: "tests/e2e/.auth/session.json",
      },
    },
  ],
});

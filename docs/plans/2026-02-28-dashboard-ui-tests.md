# Dashboard UI Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright E2E tests and Vitest component tests to `apps/dashboard` so a coding agent can run one command and get clear pass/fail output.

**Architecture:** Playwright runs headless Chromium against the real local API (wrangler dev) + dashboard dev server (quasar dev). Auth is bypassed by seeding a test session in D1 and injecting the `devicesdk-session` cookie into the browser context. Component tests use Vitest + @vue/test-utils with `installQuasarPlugin()` from Quasar's test extension and mocked API services.

**Tech Stack:** Playwright, Vitest, @vue/test-utils, @quasar/quasar-app-extension-testing-unit-vitest, jsdom

---

### Task 1: Install dependencies and configure package.json scripts

**Files:**
- Modify: `apps/dashboard/package.json`

**Step 1: Install E2E dependencies**

```bash
cd apps/dashboard && pnpm add -D @playwright/test
```

**Step 2: Install Playwright browsers**

```bash
cd apps/dashboard && npx playwright install chromium
```

**Step 3: Install component test dependencies**

```bash
cd apps/dashboard && pnpm add -D vitest @vue/test-utils @vitejs/plugin-vue jsdom @quasar/quasar-app-extension-testing-unit-vitest
```

**Step 4: Update package.json scripts**

In `apps/dashboard/package.json`, replace the existing `"test"` script and add `test:unit` and `test:e2e`:

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:e2e",
    "test:unit": "vitest run --config tests/unit/vitest.config.ts",
    "test:e2e": "playwright test --config tests/e2e/playwright.config.ts"
  }
}
```

Keep all other scripts unchanged.

**Step 5: Verify installation**

```bash
cd apps/dashboard && npx vitest --version && npx playwright --version
```

Expected: Both print version numbers without errors.

**Step 6: Commit**

```bash
git add apps/dashboard/package.json pnpm-lock.yaml
git commit -m "feat(dashboard): add test dependencies (Playwright, Vitest, Vue Test Utils)"
```

---

### Task 2: Create Playwright config, global setup, and auth setup

**Files:**
- Create: `apps/dashboard/tests/e2e/playwright.config.ts`
- Create: `apps/dashboard/tests/e2e/global-setup.ts`
- Create: `apps/dashboard/tests/e2e/global-teardown.ts`
- Create: `apps/dashboard/tests/e2e/auth.setup.ts`
- Modify: `apps/dashboard/.gitignore` (add `tests/e2e/.auth/`)

**Step 1: Create the Playwright config**

Create `apps/dashboard/tests/e2e/playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  retries: 0,
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
```

**Step 2: Create global-setup.ts**

This file starts the API and dashboard dev servers and seeds the D1 database. It stores server process references in a temp file so global-teardown can kill them.

Create `apps/dashboard/tests/e2e/global-setup.ts`:

```typescript
import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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
  const apiProcess = spawn("npx", ["wrangler", "dev", "--port", String(API_PORT)], {
    cwd: API_DIR,
    stdio: "pipe",
    env: { ...process.env, ENV: "local" },
    detached: true,
  });

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
```

**Step 3: Create global-teardown.ts**

Create `apps/dashboard/tests/e2e/global-teardown.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";

const PID_FILE = path.resolve(__dirname, ".pids.json");

export default async function globalTeardown() {
  if (!fs.existsSync(PID_FILE)) return;

  const pids = JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));

  for (const [name, pid] of Object.entries(pids)) {
    try {
      // Kill the process group (negative PID kills the group)
      process.kill(-(pid as number), "SIGTERM");
    } catch {
      // Process may already be gone
    }
  }

  fs.unlinkSync(PID_FILE);
}
```

**Step 4: Create auth.setup.ts**

Create `apps/dashboard/tests/e2e/auth.setup.ts`:

```typescript
import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.resolve(__dirname, ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "session.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await page.context().addCookies([
    {
      name: "devicesdk-session",
      value: "test-session-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);

  await page.context().storageState({ path: AUTH_FILE });
});
```

**Step 5: Update .gitignore**

Add to `apps/dashboard/.gitignore` (create if it doesn't exist):

```
tests/e2e/.auth/
tests/e2e/.pids.json
test-results/
playwright-report/
```

**Step 6: Run a smoke test to verify the setup compiles**

```bash
cd apps/dashboard && npx playwright test --config tests/e2e/playwright.config.ts --list
```

Expected: Lists the auth setup test (or shows 0 tests if no spec files yet). Should NOT error on config parsing.

**Step 7: Commit**

```bash
git add apps/dashboard/tests/e2e/ apps/dashboard/.gitignore
git commit -m "feat(dashboard): add Playwright E2E infrastructure (config, setup, auth)"
```

---

### Task 3: Create the first E2E test — Projects page

**Files:**
- Create: `apps/dashboard/tests/e2e/projects.spec.ts`

**Step 1: Write the test file**

Create `apps/dashboard/tests/e2e/projects.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test.describe("Projects page", () => {
  test("shows seeded projects", async ({ page }) => {
    await page.goto("/projects");

    // Wait for the table to load (q-linear-progress disappears)
    await expect(page.getByText("Smart Home")).toBeVisible();
    await expect(page.getByText("Weather Station")).toBeVisible();
  });

  test("can search projects", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Smart Home")).toBeVisible();

    await page.getByPlaceholder("Search projects...").fill("weather");

    await expect(page.getByText("Weather Station")).toBeVisible();
    await expect(page.getByText("Smart Home")).not.toBeVisible();
  });

  test("can navigate to project details", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Smart Home")).toBeVisible();

    // Click the Smart Home project row
    await page.getByText("Smart Home").click();

    await expect(page).toHaveURL(/\/projects\/smart-home/);
    await expect(page.getByText("Smart Home")).toBeVisible();
  });

  test("can open and close create project dialog", async ({ page }) => {
    await page.goto("/projects");

    await page.getByRole("button", { name: "Create Project" }).click();

    // Dialog should appear with stepper
    await expect(page.getByText("Create New Project")).toBeVisible();
    await expect(
      page.getByText("Recommended: Use the CLI"),
    ).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(page.getByText("Create New Project")).not.toBeVisible();
  });

  test("can create a project via manual form", async ({ page }) => {
    await page.goto("/projects");

    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByText("Create New Project")).toBeVisible();

    // Click "Create manually instead" to go to step 2
    await page.getByRole("button", { name: /manually/i }).click();

    // Fill form
    await page.getByLabel("Project Slug").fill("test-e2e-project");
    await page.getByLabel("Project Name").fill("E2E Test Project");
    await page.getByLabel("Description").fill("Created by E2E test");

    // Submit
    await page.getByRole("button", { name: "Create Project" }).click();

    // Should see the new project in the list after dialog closes
    await expect(page.getByText("E2E Test Project")).toBeVisible({
      timeout: 10000,
    });
  });
});
```

**Step 2: Run the test to verify it works**

```bash
cd apps/dashboard && npx playwright test --config tests/e2e/playwright.config.ts projects.spec.ts
```

Expected: All tests pass. If servers aren't running, global-setup starts them first.

Note: The "can create a project" test creates data — subsequent runs may need the seed SQL to clean it. The global-setup already deletes all data before seeding, so re-runs are safe.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/e2e/projects.spec.ts
git commit -m "test(dashboard): add E2E tests for projects page"
```

---

### Task 4: E2E test — Project details page

**Files:**
- Create: `apps/dashboard/tests/e2e/project-details.spec.ts`

**Step 1: Write the test file**

Create `apps/dashboard/tests/e2e/project-details.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test.describe("Project details page", () => {
  test("shows project info on overview tab", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await expect(page.getByText("Smart Home")).toBeVisible();
    await expect(page.getByText("smart-home")).toBeVisible();
    await expect(
      page.getByText("IoT smart home automation project"),
    ).toBeVisible();
  });

  test("shows devices tab", async ({ page }) => {
    await page.goto("/projects/smart-home");

    // Click Devices tab
    await page.getByRole("tab", { name: /devices/i }).click();

    // Should show devices section (may be empty)
    await expect(page.getByText(/devices/i)).toBeVisible();
  });

  test("can open add device dialog", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await page.getByRole("button", { name: /add device/i }).click();

    await expect(page.getByText("Add Device")).toBeVisible();
    await expect(
      page.getByText("Recommended: Use the CLI"),
    ).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("can navigate back to projects", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await page.getByRole("button", { name: /projects/i }).first().click();

    await expect(page).toHaveURL(/\/projects$/);
  });

  test("shows settings tab with edit form", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await page.getByRole("tab", { name: /settings/i }).click();

    await expect(page.getByText("Project Details")).toBeVisible();
    await expect(page.getByText("Danger Zone")).toBeVisible();
  });
});
```

**Step 2: Run the test**

```bash
cd apps/dashboard && npx playwright test --config tests/e2e/playwright.config.ts project-details.spec.ts
```

Expected: All pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/e2e/project-details.spec.ts
git commit -m "test(dashboard): add E2E tests for project details page"
```

---

### Task 5: E2E test — Tokens page

**Files:**
- Create: `apps/dashboard/tests/e2e/tokens.spec.ts`

**Step 1: Write the test file**

Create `apps/dashboard/tests/e2e/tokens.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test.describe("Tokens page", () => {
  test("shows tokens page with header", async ({ page }) => {
    await page.goto("/tokens");

    await expect(page.getByText("API Tokens")).toBeVisible();
    await expect(
      page.getByText("Manage API tokens for programmatic access"),
    ).toBeVisible();
  });

  test("can open create token dialog", async ({ page }) => {
    await page.goto("/tokens");

    await page.getByRole("button", { name: "Create Token" }).click();

    await expect(page.getByText("Create API Token")).toBeVisible();
    await expect(page.getByText("What are API tokens?")).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("can create a token and see it displayed", async ({ page }) => {
    await page.goto("/tokens");

    await page.getByRole("button", { name: "Create Token" }).click();

    // Fill description
    await page
      .getByPlaceholder("Describe what this token is used for")
      .fill("E2E test token");

    // Click Generate
    await page.getByRole("button", { name: "Generate Token" }).click();

    // Should show success state with the token
    await expect(
      page.getByText("Token Created Successfully!"),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Your API Token")).toBeVisible();

    // Close dialog
    await page.getByRole("button", { name: "Done" }).click();

    // Token should appear in the table
    await expect(page.getByText("E2E test token")).toBeVisible();
  });
});
```

**Step 2: Run the test**

```bash
cd apps/dashboard && npx playwright test --config tests/e2e/playwright.config.ts tokens.spec.ts
```

Expected: All pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/e2e/tokens.spec.ts
git commit -m "test(dashboard): add E2E tests for tokens page"
```

---

### Task 6: E2E test — Navigation

**Files:**
- Create: `apps/dashboard/tests/e2e/navigation.spec.ts`

**Step 1: Write the test file**

Create `apps/dashboard/tests/e2e/navigation.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test("sidebar shows navigation links", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByText("Projects")).toBeVisible();
    await expect(page.getByText("API Tokens")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("can navigate between pages via sidebar", async ({ page }) => {
    await page.goto("/projects");

    // Navigate to Tokens
    await page.getByRole("link", { name: "API Tokens" }).click();
    await expect(page).toHaveURL(/\/tokens/);
    await expect(
      page.getByText("Manage API tokens for programmatic access"),
    ).toBeVisible();

    // Navigate to Settings
    // Use the sidebar link specifically (not the user menu)
    await page
      .locator(".q-drawer")
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/account/);

    // Navigate back to Projects
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects/);
  });

  test("unauthenticated users are redirected to login", async ({
    browser,
  }) => {
    // Create a context WITHOUT auth cookies
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/projects");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Welcome back")).toBeVisible();

    await context.close();
  });

  test("login page shows Google sign-in button", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/login");

    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("DeviceSDK")).toBeVisible();

    await context.close();
  });

  test("root URL redirects to projects", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/projects/);
  });
});
```

**Step 2: Run the test**

```bash
cd apps/dashboard && npx playwright test --config tests/e2e/playwright.config.ts navigation.spec.ts
```

Expected: All pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/e2e/navigation.spec.ts
git commit -m "test(dashboard): add E2E tests for navigation and auth redirects"
```

---

### Task 7: Set up Vitest component test infrastructure

**Files:**
- Create: `apps/dashboard/tests/unit/vitest.config.ts`
- Create: `apps/dashboard/tests/unit/setup.ts`

**Step 1: Create vitest.config.ts**

Create `apps/dashboard/tests/unit/vitest.config.ts`:

```typescript
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["**/*.spec.ts"],
  },
});
```

**Step 2: Create setup.ts**

Create `apps/dashboard/tests/unit/setup.ts`:

```typescript
import { installQuasarPlugin } from "@quasar/quasar-app-extension-testing-unit-vitest";
import { Notify } from "quasar";

installQuasarPlugin({ plugins: { Notify } });
```

**Step 3: Verify config parses**

```bash
cd apps/dashboard && npx vitest run --config tests/unit/vitest.config.ts 2>&1 | head -5
```

Expected: Should show "no test files found" or similar — no parse errors.

**Step 4: Commit**

```bash
git add apps/dashboard/tests/unit/
git commit -m "feat(dashboard): add Vitest component test infrastructure"
```

---

### Task 8: Component test — CreateProjectDialog

**Files:**
- Create: `apps/dashboard/tests/unit/CreateProjectDialog.spec.ts`

**Step 1: Write the test**

Create `apps/dashboard/tests/unit/CreateProjectDialog.spec.ts`:

```typescript
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateProjectDialog from "@/components/CreateProjectDialog.vue";

// Mock the API service
vi.mock("@/services/api.service", () => ({
  projectService: {
    create: vi.fn(),
  },
}));

import { projectService } from "@/services/api.service";

describe("CreateProjectDialog", () => {
  const mountDialog = () =>
    mount(CreateProjectDialog, {
      props: {
        modelValue: true,
      },
    });

  it("renders the dialog with stepper", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Create New Project");
    expect(wrapper.text()).toContain("Recommended: Use the CLI");
  });

  it("shows CLI recommendation on step 1", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("npx @devicesdk/cli init");
  });

  it("navigates to manual form on step 2", async () => {
    const wrapper = mountDialog();

    // Click "Create manually instead"
    const manualBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("manually"));
    expect(manualBtn).toBeDefined();
    await manualBtn!.trigger("click");

    // Should show the form fields
    expect(wrapper.text()).toContain("Project Slug");
  });
});
```

**Step 2: Run to verify**

```bash
cd apps/dashboard && npx vitest run --config tests/unit/vitest.config.ts CreateProjectDialog.spec.ts
```

Expected: All 3 tests pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/unit/CreateProjectDialog.spec.ts
git commit -m "test(dashboard): add component tests for CreateProjectDialog"
```

---

### Task 9: Component test — CreateTokenDialog

**Files:**
- Create: `apps/dashboard/tests/unit/CreateTokenDialog.spec.ts`

**Step 1: Write the test**

Create `apps/dashboard/tests/unit/CreateTokenDialog.spec.ts`:

```typescript
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateTokenDialog from "@/components/CreateTokenDialog.vue";

vi.mock("@/services/api.service", () => ({
  tokenService: {
    create: vi.fn(),
  },
}));

import { tokenService } from "@/services/api.service";

describe("CreateTokenDialog", () => {
  const mountDialog = () =>
    mount(CreateTokenDialog, {
      props: {
        modelValue: true,
      },
    });

  it("renders the dialog with form", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Create API Token");
    expect(wrapper.text()).toContain("What are API tokens?");
  });

  it("shows Generate Token button", () => {
    const wrapper = mountDialog();
    const btn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Generate Token"));
    expect(btn).toBeDefined();
  });

  it("shows success state after token creation", async () => {
    const mockToken = "dsdk_test_abc123";
    vi.mocked(tokenService.create).mockResolvedValue({
      id: "tok-1",
      token: mockToken,
      last_four: "c123",
      created_at: Date.now(),
    });

    const wrapper = mountDialog();

    // Click Generate Token
    const btn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Generate Token"));
    await btn!.trigger("click");

    // Wait for async
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain("Token Created Successfully!");
  });
});
```

**Step 2: Run to verify**

```bash
cd apps/dashboard && npx vitest run --config tests/unit/vitest.config.ts CreateTokenDialog.spec.ts
```

Expected: All 3 tests pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/unit/CreateTokenDialog.spec.ts
git commit -m "test(dashboard): add component tests for CreateTokenDialog"
```

---

### Task 10: Component test — CreateDeviceDialog

**Files:**
- Create: `apps/dashboard/tests/unit/CreateDeviceDialog.spec.ts`

**Step 1: Write the test**

Create `apps/dashboard/tests/unit/CreateDeviceDialog.spec.ts`:

```typescript
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateDeviceDialog from "@/components/CreateDeviceDialog.vue";

vi.mock("@/services/api.service", () => ({
  deviceService: {
    create: vi.fn(),
  },
}));

describe("CreateDeviceDialog", () => {
  const mountDialog = () =>
    mount(CreateDeviceDialog, {
      props: {
        modelValue: true,
        projectId: "smart-home",
      },
    });

  it("renders the dialog", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Add Device");
    expect(wrapper.text()).toContain("Recommended: Use the CLI");
  });

  it("shows CLI config example on step 1", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("devicesdk.ts");
    expect(wrapper.text()).toContain("npx @devicesdk/cli deploy");
  });

  it("navigates to manual form on step 2", async () => {
    const wrapper = mountDialog();

    const manualBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("manually"));
    expect(manualBtn).toBeDefined();
    await manualBtn!.trigger("click");

    expect(wrapper.text()).toContain("Device Slug");
  });
});
```

**Step 2: Run to verify**

```bash
cd apps/dashboard && npx vitest run --config tests/unit/vitest.config.ts CreateDeviceDialog.spec.ts
```

Expected: All 3 tests pass.

**Step 3: Commit**

```bash
git add apps/dashboard/tests/unit/CreateDeviceDialog.spec.ts
git commit -m "test(dashboard): add component tests for CreateDeviceDialog"
```

---

### Task 11: Run all tests end-to-end and verify the full pipeline

**Step 1: Run component tests**

```bash
cd apps/dashboard && pnpm test:unit
```

Expected: All component tests pass (9 tests across 3 files).

**Step 2: Run E2E tests**

Make sure no other dev servers are running on ports 8787 and 9000, then:

```bash
cd apps/dashboard && pnpm test:e2e
```

Expected: Global setup starts servers, auth setup injects cookie, all E2E tests pass, global teardown kills servers.

**Step 3: Run the combined command**

```bash
pnpm test --filter @devicesdk/dashboard
```

Expected: Component tests run first, then E2E tests. All pass.

**Step 4: Commit any fixes needed**

If adjustments were needed, commit them:

```bash
git add -A apps/dashboard/tests/
git commit -m "fix(dashboard): adjust tests for runtime compatibility"
```

---

### Task 12: Update CLAUDE.md and create .dev.vars

**Files:**
- Modify: `CLAUDE.md` (root)
- Create: `apps/api/.dev.vars` (if not exists — needed for `ENV=local`)

**Step 1: Add dashboard test commands to CLAUDE.md**

In the root `CLAUDE.md`, under the `## Build & Development Commands` section, add after the existing test commands:

```markdown
# Dashboard UI tests
pnpm test:unit --filter @devicesdk/dashboard  # Vitest component tests (~2s)
pnpm test:e2e --filter @devicesdk/dashboard   # Playwright E2E tests (~30s, starts servers)
pnpm test --filter @devicesdk/dashboard        # Both component + E2E
```

**Step 2: Ensure .dev.vars exists**

If `apps/api/.dev.vars` doesn't exist, create it with:

```
ENV=local
```

This is needed for the API to set cookies on `localhost` correctly. The file is gitignored.

**Step 3: Lint**

```bash
pnpm lint --filter @devicesdk/dashboard
```

Expected: No lint errors.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add dashboard UI test commands to CLAUDE.md"
```

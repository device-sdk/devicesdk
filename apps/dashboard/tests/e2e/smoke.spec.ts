import { expect, test } from "./fixtures";

// Smoke test: full new-user dashboard flow in a single sequential test.
// Running as one test means a failure at any step produces a clear message
// (e.g. "can create a project > step 3 failed") rather than cascading
// failures across sibling tests that share the same project name.
//
// Note: "deploy → flash → see logs" requires physical hardware and is not
// automatable in CI. This covers the dashboard flow only.

const SMOKE_PROJECT = "smoke-e2e-project";

test("smoke: full user flow (create project → device → token → delete)", async ({
  page,
}) => {
  // ── Step 1: projects list loads ──────────────────────────────────────────
  await page.goto("/projects");
  await expect(page.getByText("smart-home").first()).toBeVisible({
    timeout: 10000,
  });

  // ── Step 2: create a new project ─────────────────────────────────────────
  await page.getByRole("button", { name: "Create Project" }).first().click();

  const manualBtn = page.getByRole("button", { name: /manually/i });
  if (await manualBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await manualBtn.click();
  }

  await page.getByPlaceholder("e.g., smart-home-hub").fill(SMOKE_PROJECT);
  await page
    .getByPlaceholder("e.g., Smart Home Hub")
    .fill("Smoke E2E Project");
  await page
    .getByPlaceholder("Describe your project...")
    .fill("Created by E2E smoke test");

  await page
    .locator(".q-dialog")
    .getByRole("button", { name: "Create Project" })
    .click();

  await expect(page.getByText(SMOKE_PROJECT).first()).toBeVisible({
    timeout: 10000,
  });

  // ── Step 3: navigate into the project ────────────────────────────────────
  await page.locator(".q-table").getByText(SMOKE_PROJECT).first().click();

  await expect(page).toHaveURL(new RegExp(`/projects/${SMOKE_PROJECT}`), {
    timeout: 10000,
  });
  await expect(
    page.getByRole("heading", { name: "Smoke E2E Project" }),
  ).toBeVisible({ timeout: 10000 });

  // ── Step 4: create a device ───────────────────────────────────────────────
  await page
    .getByRole("button", { name: /add device/i })
    .first()
    .click();

  await expect(page.getByText("Register a new device")).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: /manually/i }).click();

  await page
    .getByPlaceholder("e.g., living-room-sensor")
    .fill("smoke-device");
  await page
    .getByPlaceholder("e.g., Living Room Temperature Sensor")
    .fill("Smoke Device");

  await page
    .locator(".q-dialog")
    .getByRole("button", { name: "Add Device" })
    .click();

  await expect(
    page.getByText('"smoke-device" added successfully'),
  ).toBeVisible({ timeout: 10000 });

  // ── Step 5: device details show offline status ────────────────────────────
  await page.getByText("smoke-device").first().click();

  await expect(page).toHaveURL(
    new RegExp(`/projects/${SMOKE_PROJECT}/devices/smoke-device`),
    { timeout: 10000 },
  );
  await expect(page.getByText("Smoke Device")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Offline").first()).toBeVisible({
    timeout: 5000,
  });

  // ── Step 6: create an API token ───────────────────────────────────────────
  await page.goto("/tokens");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Create Token" }).first().click();

  await page
    .getByPlaceholder("Describe what this token is used for")
    .fill("Smoke test token");

  await page.getByRole("button", { name: "Generate Token" }).click();

  await expect(page.getByText("Token Created Successfully!")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Done" }).click();

  // ── Step 7: delete the smoke project (cleanup) ────────────────────────────
  await page.goto(`/projects/${SMOKE_PROJECT}`);
  await expect(
    page.getByRole("heading", { name: "Smoke E2E Project" }),
  ).toBeVisible({ timeout: 10000 });

  await page.getByRole("tab", { name: /settings/i }).click();
  await page.getByRole("button", { name: "Delete Project" }).click();

  await expect(
    page.locator(".q-dialog").getByText("Delete Project"),
  ).toBeVisible();

  const deleteBtn = page
    .locator(".q-dialog")
    .getByRole("button", { name: "Delete" });
  await expect(deleteBtn).toBeDisabled();

  await page.getByPlaceholder("Project slug").fill(SMOKE_PROJECT);
  await expect(deleteBtn).toBeEnabled();
  await deleteBtn.click();

  await expect(page).toHaveURL(/\/projects$/, { timeout: 10000 });
  await expect(page.getByText("Project deleted")).toBeVisible();
});

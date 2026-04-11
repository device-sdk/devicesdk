import { expect, test } from "./fixtures";

// Smoke test: covers the core new-user flow end-to-end.
// Note: "deploy → flash → see logs" requires physical hardware and is not
// automatable in CI. This test covers the dashboard flow only.
test.describe("Smoke: full user flow", () => {
  const SMOKE_PROJECT = "smoke-e2e-project";

  test.afterAll(async ({ browser }) => {
    // Cleanup: delete the smoke project if it survived
    const page = await browser.newPage();
    try {
      await page.goto(`/projects/${SMOKE_PROJECT}`);
      const heading = page.getByRole("heading", { name: /smoke/i });
      const exists = await heading.isVisible({ timeout: 3000 }).catch(() => false);
      if (!exists) return;

      await page.getByRole("tab", { name: /settings/i }).click();
      await page.getByRole("button", { name: "Delete Project" }).click();
      await expect(
        page.locator(".q-dialog").getByText("Delete Project"),
      ).toBeVisible({ timeout: 5000 });
      await page.getByPlaceholder("Project slug").fill(SMOKE_PROJECT);
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Delete" })
        .click();
    } finally {
      await page.close();
    }
  });

  test("can create a project", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("smart-home").first()).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole("button", { name: "Create Project" }).first().click();

    // Use manual entry if there's a choice dialog
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
  });

  test("can navigate into the project", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText(SMOKE_PROJECT).first()).toBeVisible({
      timeout: 10000,
    });

    await page.locator(".q-table").getByText(SMOKE_PROJECT).first().click();

    await expect(page).toHaveURL(new RegExp(`/projects/${SMOKE_PROJECT}`), {
      timeout: 10000,
    });
    await expect(
      page.getByRole("heading", { name: "Smoke E2E Project" }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("can create a device in the project", async ({ page }) => {
    await page.goto(`/projects/${SMOKE_PROJECT}`);
    await expect(
      page.getByRole("heading", { name: "Smoke E2E Project" }),
    ).toBeVisible({ timeout: 10000 });

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
  });

  test("can navigate to device details and see offline status", async ({
    page,
  }) => {
    await page.goto(`/projects/${SMOKE_PROJECT}`);
    await expect(
      page.getByRole("heading", { name: "Smoke E2E Project" }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByText("smoke-device").first().click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${SMOKE_PROJECT}/devices/smoke-device`),
      { timeout: 10000 },
    );

    await expect(page.getByText("Smoke Device")).toBeVisible({
      timeout: 10000,
    });

    // Device should be offline since it's never connected
    await expect(page.getByText("Offline").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("can create an API token", async ({ page }) => {
    await page.goto("/tokens");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: "Create Token" })
      .first()
      .click();

    await page
      .getByPlaceholder("Describe what this token is used for")
      .fill("Smoke test token");

    await page.getByRole("button", { name: "Generate Token" }).click();

    await expect(page.getByText("Token Created Successfully!")).toBeVisible({
      timeout: 10000,
    });

    // Close the dialog
    await page.getByRole("button", { name: "Done" }).click();
  });

  test("can delete the smoke project", async ({ page }) => {
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
});

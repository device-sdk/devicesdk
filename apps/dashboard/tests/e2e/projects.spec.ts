import { expect, test } from "./fixtures";

test.describe("Projects page", () => {
  test("shows seeded projects", async ({ page }) => {
    await page.goto("/projects");

    // Wait for the table to load
    await expect(page.getByText("Smart Home")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Weather Station")).toBeVisible();
  });

  test("can search projects", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Smart Home")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Search projects...").fill("weather");

    await expect(page.getByText("Weather Station")).toBeVisible();
    await expect(page.getByText("Smart Home")).not.toBeVisible();
  });

  test("can navigate to project details", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Smart Home")).toBeVisible({ timeout: 10000 });

    // Click the Smart Home project row in the table
    await page
      .locator(".q-table")
      .getByText("Smart Home")
      .click();

    await expect(page).toHaveURL(/\/projects\/smart-home/);
  });

  test("can open and close create project dialog", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: "Create Project" })
      .first()
      .click();

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
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: "Create Project" })
      .first()
      .click();
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

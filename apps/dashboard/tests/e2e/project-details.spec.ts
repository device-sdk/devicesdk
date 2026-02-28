import { expect, test } from "@playwright/test";

test.describe("Project details page", () => {
  test("shows project info on overview tab", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await expect(page.getByText("Smart Home")).toBeVisible();
    await expect(page.getByText("smart-home")).toBeVisible();
    await expect(page.getByText("IoT smart home automation project")).toBeVisible();
  });

  test("shows devices tab", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await page.getByRole("tab", { name: /devices/i }).click();

    await expect(page.getByText(/devices/i)).toBeVisible();
  });

  test("can open add device dialog", async ({ page }) => {
    await page.goto("/projects/smart-home");

    await page.getByRole("button", { name: /add device/i }).click();

    await expect(page.getByText("Add Device")).toBeVisible();
    await expect(page.getByText("Recommended: Use the CLI")).toBeVisible();

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

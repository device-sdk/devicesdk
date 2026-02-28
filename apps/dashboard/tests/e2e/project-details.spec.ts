import { expect, test } from "./fixtures";

test.describe("Project details page", () => {
  test("shows project info on overview tab", async ({ page }) => {
    await page.goto("/projects/smart-home");

    // Use heading to avoid strict mode (Smart Home appears in breadcrumbs, heading, and info)
    await expect(
      page.getByRole("heading", { name: "Smart Home" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("smart-home").first()).toBeVisible();
    await expect(
      page.getByText("IoT smart home automation project"),
    ).toBeVisible();
  });

  test("shows devices tab", async ({ page }) => {
    await page.goto("/projects/smart-home");
    await expect(
      page.getByRole("heading", { name: "Smart Home" }),
    ).toBeVisible({ timeout: 10000 });

    // Click Devices tab
    await page.getByRole("tab", { name: /devices/i }).click();

    // Should show devices section (may be empty)
    await expect(page.getByText(/devices/i).first()).toBeVisible();
  });

  test("can open add device dialog", async ({ page }) => {
    await page.goto("/projects/smart-home");
    await expect(
      page.getByRole("heading", { name: "Smart Home" }),
    ).toBeVisible({ timeout: 10000 });

    await page
      .getByRole("button", { name: /add device/i })
      .first()
      .click();

    await expect(page.getByText("Register a new device")).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("can navigate back to projects", async ({ page }) => {
    await page.goto("/projects/smart-home");
    await expect(
      page.getByRole("heading", { name: "Smart Home" }),
    ).toBeVisible({ timeout: 10000 });

    // Click the back button (q-btn with to="/projects" renders as <a>, not <button>)
    await page.locator(".back-btn").click();

    await expect(page).toHaveURL(/\/projects$/, { timeout: 10000 });
  });

  test("shows settings tab with edit form", async ({ page }) => {
    await page.goto("/projects/smart-home");
    await expect(
      page.getByRole("heading", { name: "Smart Home" }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("tab", { name: /settings/i }).click();

    await expect(page.getByText("Project Details")).toBeVisible();
    await expect(page.getByText("Danger Zone")).toBeVisible();
  });
});

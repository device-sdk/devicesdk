import { expect, test } from "./fixtures";

test.describe("UI behaviors", () => {
  test.describe("Form validation", () => {
    test("create project dialog shows validation on invalid slug", async ({
      page,
    }) => {
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: "Create Project" })
        .first()
        .click();
      await page.getByRole("button", { name: /manually/i }).click();

      // Type invalid slug (starts with number)
      await page.getByPlaceholder("e.g., smart-home-hub").fill("123-invalid");

      // Click away to trigger validation (click on the name field)
      await page.getByPlaceholder("e.g., Smart Home Hub").click();

      // Should show validation error
      await expect(
        page.getByText("Must start with a letter"),
      ).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("create device dialog shows validation on empty slug", async ({
      page,
    }) => {
      await page.goto("/projects/smart-home");
      await expect(
        page.getByRole("heading", { name: "Smart Home" }),
      ).toBeVisible({ timeout: 10000 });

      await page
        .getByRole("button", { name: /add device/i })
        .first()
        .click();
      await page.getByRole("button", { name: /manually/i }).click();

      // Try to submit without filling slug
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Add Device" })
        .click();

      // Should show validation error
      await expect(
        page.getByText("Device slug is required"),
      ).toBeVisible();

      await page.keyboard.press("Escape");
    });
  });

  test.describe("Empty states", () => {
    test("project devices tab shows empty state when no devices", async ({
      page,
    }) => {
      // weather-station has no devices
      await page.goto("/projects/weather-station");
      await expect(
        page.getByRole("heading", { name: /Weather Station/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /devices/i }).click();

      await expect(page.getByText("No devices yet")).toBeVisible();
      await expect(
        page.getByText("Add your first device to get started"),
      ).toBeVisible();
    });

    test("device versions tab shows empty state", async ({ page }) => {
      await page.goto("/projects/smart-home/devices/led-controller");
      await expect(
        page.getByRole("heading", { name: /LED Controller/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /versions/i }).click();

      await expect(page.getByText("No versions yet")).toBeVisible();
    });

    test("device logs tab shows empty state", async ({ page }) => {
      await page.goto("/projects/smart-home/devices/led-controller");
      await expect(
        page.getByRole("heading", { name: /LED Controller/i }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /logs/i }).click();

      await expect(page.getByText("No logs yet")).toBeVisible();
    });
  });

  test.describe("Navigation", () => {
    test("project details breadcrumbs navigate correctly", async ({
      page,
    }) => {
      await page.goto("/projects/smart-home");
      await expect(
        page.getByRole("heading", { name: "Smart Home" }),
      ).toBeVisible({ timeout: 10000 });

      const breadcrumbs = page.locator(".q-breadcrumbs");
      await expect(breadcrumbs).toBeVisible();

      // Click the folder icon breadcrumb to go back to projects
      await breadcrumbs.locator("a").first().click();
      await expect(page).toHaveURL(/\/projects$/, { timeout: 10000 });
    });

    test("project details device row navigates to device details", async ({
      page,
    }) => {
      await page.goto("/projects/smart-home");
      await expect(
        page.getByRole("heading", { name: "Smart Home" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /devices/i }).click();

      // Click on temp-sensor device row
      await page.locator(".q-table").getByText("temp-sensor").first().click();

      await expect(page).toHaveURL(
        /\/projects\/smart-home\/devices\/temp-sensor/,
        { timeout: 10000 },
      );
    });
  });

  test.describe("Dialog flows", () => {
    test("create project dialog shows CLI step first", async ({ page }) => {
      await page.goto("/projects");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: "Create Project" })
        .first()
        .click();

      // Step 1: CLI instructions
      await expect(
        page.getByText("Recommended: Use the CLI"),
      ).toBeVisible();
      await expect(
        page.getByText("npx @devicesdk/cli init"),
      ).toBeVisible();

      // Navigate to manual step
      await page.getByRole("button", { name: /manually/i }).click();

      // Step 2: Form
      await expect(
        page.getByPlaceholder("e.g., smart-home-hub"),
      ).toBeVisible();

      // Back button returns to step 1
      await page.getByRole("button", { name: "Back" }).click();
      await expect(
        page.getByText("Recommended: Use the CLI"),
      ).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("create device dialog shows CLI step first", async ({ page }) => {
      await page.goto("/projects/smart-home");
      await expect(
        page.getByRole("heading", { name: "Smart Home" }),
      ).toBeVisible({ timeout: 10000 });

      await page
        .getByRole("button", { name: /add device/i })
        .first()
        .click();

      // Step 1: CLI instructions
      await expect(
        page.getByText("Recommended: Use the CLI"),
      ).toBeVisible();

      await page.keyboard.press("Escape");
    });

    test("delete project dialog from projects list page", async ({
      page,
    }) => {
      await page.goto("/projects");
      await expect(page.getByText("smart-home").first()).toBeVisible({
        timeout: 10000,
      });

      // Click the menu button on smart-home row - use more_vert icon
      await page
        .locator(".q-table .q-tr")
        .filter({ hasText: "smart-home" })
        .getByRole("button")
        .click();

      // Menu should appear with Delete option
      await expect(page.getByText("Delete").last()).toBeVisible();

      // Click Delete
      await page
        .locator(".q-menu")
        .getByText("Delete", { exact: true })
        .click();

      // Dialog should appear with slug confirmation
      await expect(
        page.locator(".q-dialog").getByText("Delete Project"),
      ).toBeVisible();

      // Close without deleting
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Cancel" })
        .click();
    });
  });
});

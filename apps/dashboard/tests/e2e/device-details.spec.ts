import { expect, test } from "./fixtures";

test.describe("Device details page", () => {
  const deviceUrl = "/projects/smart-home/devices/temp-sensor";

  test.describe("Overview tab", () => {
    test("shows device info and status", async ({ page }) => {
      await page.goto(deviceUrl);

      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      // Status chip (offline since last_connected_at is NULL)
      await expect(page.getByText("Offline").first()).toBeVisible();

      // Device information section
      await expect(page.getByText("Device Information")).toBeVisible();
      await expect(page.getByText("temp-sensor").first()).toBeVisible();
    });

    test("shows no script deployed empty state", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByText("Current Script")).toBeVisible();
      await expect(page.getByText("No script deployed")).toBeVisible();
    });

    test("shows quick action buttons", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByText("Quick Actions")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Upload Script" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Edit Device" }),
      ).toBeVisible();
    });

    test("upload script button switches to script tab", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("button", { name: "Upload Script" }).click();

      await expect(page.getByText("Script Editor")).toBeVisible();
    });
  });

  test.describe("Script tab", () => {
    test("shows script editor with template dropdown", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();

      await expect(page.getByText("Script Editor")).toBeVisible();
      await expect(page.getByText("Load Template")).toBeVisible();
      await expect(
        page.getByPlaceholder("// Enter your device script here..."),
      ).toBeVisible();
    });

    test("can load a template", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();
      await expect(page.getByText("Script Editor")).toBeVisible();

      // Open template dropdown and select Basic Blink
      await page.getByText("Load Template").click();
      await page.getByText("Basic Blink").click();

      // Editor should now contain the template code
      await expect(
        page.getByText("Basic Blink template"),
      ).toBeVisible();
    });

    test("shows character count", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();
      await expect(page.getByText("Script Editor")).toBeVisible();

      // Character count should show
      await expect(page.getByText("/ 1,048,576 characters")).toBeVisible();
    });

    test("deploy button is disabled when script is empty", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();
      await expect(page.getByText("Script Editor")).toBeVisible();

      await expect(
        page.getByRole("button", { name: "Deploy Script" }),
      ).toBeDisabled();
    });

    test("can deploy a script", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();
      await expect(page.getByText("Script Editor")).toBeVisible();

      // Load a template
      await page.getByText("Load Template").click();
      await page.getByText("Basic Blink").click();

      // Add deployment message
      await page
        .getByLabel("Deployment message (optional)")
        .fill("E2E test deployment");

      // Deploy
      await page.getByRole("button", { name: "Deploy Script" }).click();

      // Should see success notification
      await expect(
        page.getByText("Script deployed successfully"),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Versions tab", () => {
    test("shows version history after deployment", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /versions/i }).click();

      await expect(page.getByText("Version History")).toBeVisible();
    });

    test("shows empty state when no versions exist", async ({ page }) => {
      // Use led-controller which has no scripts
      await page.goto("/projects/smart-home/devices/led-controller");
      await expect(
        page.getByRole("heading", { name: "LED Controller" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /versions/i }).click();

      await expect(page.getByText("No versions yet")).toBeVisible();
      await expect(
        page.getByText("Deploy your first script to create a version"),
      ).toBeVisible();
    });
  });

  test.describe("Logs tab", () => {
    test("shows logs empty state", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /logs/i }).click();

      await expect(page.getByText("No logs yet")).toBeVisible();
      await expect(
        page.getByText("Logs from console.log, console.warn"),
      ).toBeVisible();
    });

    test("shows level filter and auto-refresh controls", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /logs/i }).click();

      await expect(page.getByText("Level")).toBeVisible();
      await expect(page.getByText("Auto-refresh")).toBeVisible();
    });
  });

  test.describe("Settings tab", () => {
    test("shows edit form with pre-filled values", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      await expect(page.getByText("Device Details")).toBeVisible();
      await expect(page.getByLabel("Device Name")).toHaveValue(
        "Temperature Sensor",
      );
      await expect(page.getByLabel("Description")).toHaveValue(
        "Living room temperature monitor",
      );
      await expect(
        page.getByRole("button", { name: "Save Changes" }),
      ).toBeVisible();
    });

    test("shows danger zone with delete button", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      await expect(page.getByText("Danger Zone")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Delete Device" }),
      ).toBeVisible();
    });
  });

  test.describe("Navigation", () => {
    test("breadcrumbs show correct path", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      // Breadcrumb should show project slug and device name
      const breadcrumbs = page.locator(".q-breadcrumbs");
      await expect(breadcrumbs.getByText("smart-home")).toBeVisible();
      await expect(
        breadcrumbs.getByText("Temperature Sensor"),
      ).toBeVisible();
    });

    test("back button navigates to project details", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.locator(".back-btn").click();

      await expect(page).toHaveURL(/\/projects\/smart-home/, {
        timeout: 10000,
      });
    });
  });
});

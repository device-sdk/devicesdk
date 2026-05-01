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
      await page
        .locator(".q-select")
        .filter({ hasText: "Load Template" })
        .click();
      await page.locator(".q-menu").getByText("Basic Blink").click();

      // Editor should now contain the template code (textarea value, not visible text)
      await expect(
        page.getByPlaceholder("// Enter your device script here..."),
      ).toHaveValue(/LED_PIN/);
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

    test("deploy button enables after loading template and triggers API call", async ({
      page,
    }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /script/i }).click();
      await expect(page.getByText("Script Editor")).toBeVisible();

      // Deploy button should be disabled when script is empty
      const deployBtn = page.getByRole("button", { name: "Deploy Script" });
      await expect(deployBtn).toBeDisabled();

      // Load a template
      await page
        .locator(".q-select")
        .filter({ hasText: "Load Template" })
        .click();
      await page.locator(".q-menu").getByText("Basic Blink").click();

      // Wait for template to load into editor
      await expect(
        page.getByPlaceholder("// Enter your device script here..."),
      ).toHaveValue(/LED_PIN/);

      // Deploy button should now be enabled
      await expect(deployBtn).toBeEnabled();

      // Fill deployment message
      await page
        .getByLabel("Deployment message (optional)")
        .fill("E2E test deployment");

      // Click deploy and verify it triggers an API call
      const responsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/script") &&
          resp.request().method() === "PUT",
        { timeout: 15000 },
      );
      await deployBtn.click();
      const response = await responsePromise;

      // Verify the API was called (response received regardless of status)
      expect(response.status()).toBeTruthy();
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

    test("shows level filter and online status chip", async ({ page }) => {
      await page.goto(deviceUrl);
      await expect(
        page.getByRole("heading", { name: "Temperature Sensor" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /logs/i }).click();

      // Logs panel is WS-only since May 2026; the legacy "Live" toggle is gone.
      // What remains: the level filter and an Online/Offline status chip.
      // Scope to the logs tab panel — there are two other Online/Offline chips
      // on the page (header + overview "Status" row) that would trip strict mode.
      const logsPanel = page
        .locator(".q-tab-panel")
        .filter({ hasText: "Level" });
      await expect(logsPanel.getByText("Level", { exact: true })).toBeVisible();
      await expect(logsPanel.getByText(/Online|Offline/)).toBeVisible();
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

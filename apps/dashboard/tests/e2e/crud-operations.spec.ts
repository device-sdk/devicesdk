import { expect, test } from "./fixtures";

test.describe("CRUD operations", () => {
  test.describe("Create device", () => {
    test("can create a device via manual form", async ({ page }) => {
      await page.goto("/projects/smart-home");
      await expect(
        page.getByRole("heading", { name: "Smart Home" }),
      ).toBeVisible({ timeout: 10000 });

      // Open add device dialog
      await page
        .getByRole("button", { name: /add device/i })
        .first()
        .click();

      await expect(page.getByText("Register a new device")).toBeVisible();

      // Go to manual step
      await page.getByRole("button", { name: /manually/i }).click();

      // Fill form
      await page
        .getByPlaceholder("e.g., living-room-sensor")
        .fill("e2e-test-device");
      await page
        .getByPlaceholder("e.g., Living Room Temperature Sensor")
        .fill("E2E Test Device");
      await page
        .getByPlaceholder("Describe this device...")
        .fill("Created by E2E test");

      // Submit
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Add Device" })
        .click();

      // Should see success notification
      await expect(
        page.getByText('"e2e-test-device" added successfully'),
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Edit project", () => {
    test("can edit project name and description via settings tab", async ({
      page,
    }) => {
      await page.goto("/projects/weather-station");
      await expect(
        page.getByRole("heading", { name: "Weather Station" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      await expect(page.getByText("Project Details")).toBeVisible();

      // Clear and update name
      await page.getByLabel("Project Name").clear();
      await page.getByLabel("Project Name").fill("Weather Station Updated");

      // Clear and update description
      await page.getByLabel("Description").clear();
      await page.getByLabel("Description").fill("Updated by E2E test");

      // Save
      await page.getByRole("button", { name: "Save Changes" }).click();

      // Should see success notification
      await expect(page.getByText("Project updated")).toBeVisible({
        timeout: 10000,
      });

      // Heading should update
      await expect(
        page.getByRole("heading", { name: "Weather Station Updated" }),
      ).toBeVisible();
    });
  });

  test.describe("Edit device", () => {
    test("can edit device via settings tab", async ({ page }) => {
      await page.goto("/projects/smart-home/devices/led-controller");
      await expect(
        page.getByRole("heading", { name: "LED Controller" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      // Update name
      await page.getByLabel("Device Name").clear();
      await page.getByLabel("Device Name").fill("LED Controller Updated");

      // Save
      await page.getByRole("button", { name: "Save Changes" }).click();

      await expect(page.getByText("Device updated")).toBeVisible({
        timeout: 10000,
      });

      // Restore original name so downstream tests aren't affected
      await page.getByLabel("Device Name").clear();
      await page.getByLabel("Device Name").fill("LED Controller");
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(page.getByText("Device updated")).toBeVisible({
        timeout: 10000,
      });
    });

    test("can edit device via edit dialog from overview", async ({ page }) => {
      await page.goto("/projects/smart-home/devices/led-controller");
      await expect(
        page.getByRole("heading", { name: "LED Controller" }),
      ).toBeVisible({ timeout: 10000 });

      // Click Edit Device button in quick actions
      await page.getByRole("button", { name: "Edit Device" }).click();

      // Edit dialog appears
      await expect(
        page.locator(".q-dialog").getByText("Edit Device"),
      ).toBeVisible();

      // Update name in dialog
      const nameInput = page.locator(".q-dialog").getByLabel("Name");
      await nameInput.clear();
      await nameInput.fill("LED Strip Updated");

      // Save
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Save" })
        .click();

      await expect(page.getByText("Device updated")).toBeVisible({
        timeout: 10000,
      });

      // Restore original name so downstream tests aren't affected
      await page.getByRole("button", { name: "Edit Device" }).click();
      const restoreInput = page.locator(".q-dialog").getByLabel("Name");
      await restoreInput.clear();
      await restoreInput.fill("LED Controller");
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Save" })
        .click();
      await expect(page.getByText("Device updated")).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Create token with options", () => {
    test("can create token with description and managed toggle", async ({
      page,
    }) => {
      await page.goto("/tokens");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: "Create Token" })
        .first()
        .click();

      // Fill description
      await page
        .getByPlaceholder("Describe what this token is used for")
        .fill("Managed E2E token");

      // Toggle managed on
      await page.getByText("Managed token").click();

      // Submit
      await page.getByRole("button", { name: "Generate Token" }).click();

      // Success state
      await expect(
        page.getByText("Token Created Successfully!"),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Your API Token")).toBeVisible();

      // Close
      await page.getByRole("button", { name: "Done" }).click();
    });
  });

  test.describe("Delete token", () => {
    test("can delete a token with confirmation", async ({ page }) => {
      await page.goto("/tokens");
      await page.waitForLoadState("networkidle");

      // Should see the seeded token
      await expect(page.locator(".token-chip").first()).toBeVisible({
        timeout: 10000,
      });

      // Click delete button on first token row
      await page
        .locator(".q-table tbody .q-tr")
        .first()
        .getByRole("button")
        .click();

      // Confirmation dialog appears
      await expect(page.getByText("Delete Token?")).toBeVisible();
      await expect(
        page.getByText("Are you sure you want to delete this token?"),
      ).toBeVisible();

      // Click Delete
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Delete" })
        .click();

      // Dialog should close (wait for it to disappear)
      await expect(page.getByText("Delete Token?")).not.toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Delete device", () => {
    test("can delete device with confirmation dialog", async ({ page }) => {
      await page.goto(
        "/projects/deletable-project/devices/deletable-device",
      );
      await expect(
        page.getByRole("heading", { name: "Deletable Device" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      // Click Delete Device in danger zone
      await page.getByRole("button", { name: "Delete Device" }).click();

      // Confirmation dialog
      await expect(
        page.locator(".q-dialog").getByText("Delete Device"),
      ).toBeVisible();
      await expect(
        page.getByText("Are you sure you want to delete"),
      ).toBeVisible();

      // Click Delete
      await page
        .locator(".q-dialog")
        .getByRole("button", { name: "Delete" })
        .click();

      // The success toast and the redirect fire in the same tick, and the
      // toast auto-dismisses after ~5s. Assert it before waiting on the
      // redirect so a slow delete under CI load can't let it expire first;
      // Quasar notifications render at the document root and survive the
      // route change.
      await expect(page.getByText("Device deleted")).toBeVisible({
        timeout: 10000,
      });
      // Should redirect to project page
      await expect(page).toHaveURL(/\/projects\/deletable-project/, {
        timeout: 10000,
      });
    });
  });

  test.describe("Delete project", () => {
    test("delete button requires slug confirmation", async ({ page }) => {
      await page.goto("/projects/deletable-project");
      await expect(
        page.getByRole("heading", { name: "Deletable Project" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByRole("tab", { name: /settings/i }).click();

      // Click Delete Project
      await page.getByRole("button", { name: "Delete Project" }).click();

      // Dialog with slug confirmation
      await expect(
        page.locator(".q-dialog").getByText("Delete Project"),
      ).toBeVisible();

      // Delete button should be disabled initially
      const deleteBtn = page
        .locator(".q-dialog")
        .getByRole("button", { name: "Delete" });
      await expect(deleteBtn).toBeDisabled();

      // Type wrong slug
      await page.getByPlaceholder("Project slug").fill("wrong-slug");
      await expect(deleteBtn).toBeDisabled();

      // Type correct slug
      await page
        .getByPlaceholder("Project slug")
        .fill("deletable-project");
      await expect(deleteBtn).toBeEnabled();

      // Delete
      await deleteBtn.click();

      // Assert the toast before the redirect (see device-delete note above).
      await expect(page.getByText("Project deleted")).toBeVisible({
        timeout: 10000,
      });
      // Should redirect to projects list
      await expect(page).toHaveURL(/\/projects$/, { timeout: 10000 });
    });
  });
});

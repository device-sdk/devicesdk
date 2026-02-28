import { expect, test } from "./fixtures";

test.describe("Account page", () => {
  test("displays profile information", async ({ page }) => {
    await page.goto("/account");

    await expect(
      page.getByRole("heading", { name: "Account" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Manage your profile and settings"),
    ).toBeVisible();

    // Profile section shows user details
    await expect(page.getByText("Profile")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("alice@example.com").first()).toBeVisible();
  });

  test("shows email verification status", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText("Profile")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Email Verified")).toBeVisible();
    await expect(page.getByText("Verified")).toBeVisible();
  });

  test("shows member since date", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText("Profile")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Member Since")).toBeVisible();
  });

  test("shows preferences placeholder", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText("Profile")).toBeVisible({ timeout: 10000 });

    await expect(page.getByText("Preferences")).toBeVisible();
    await expect(
      page.getByText("Preferences will be available in a future update"),
    ).toBeVisible();
  });

  test("delete account dialog requires typing DELETE", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByText("Danger Zone")).toBeVisible({ timeout: 10000 });

    // Click Delete Account button
    await page
      .getByRole("button", { name: "Delete Account" })
      .first()
      .click();

    // Dialog appears
    await expect(
      page.locator(".q-dialog").getByText("Delete Account"),
    ).toBeVisible();
    await expect(
      page.getByText("Are you sure you want to delete your account?"),
    ).toBeVisible();

    // Delete button is disabled initially
    const deleteBtn = page
      .locator(".q-dialog")
      .getByRole("button", { name: "Delete Account" });
    await expect(deleteBtn).toBeDisabled();

    // Type DELETE to enable
    await page.getByPlaceholder("DELETE").fill("DELETE");
    await expect(deleteBtn).toBeEnabled();

    // Close dialog
    await page.keyboard.press("Escape");
  });
});

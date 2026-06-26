import { expect, test } from "./fixtures";

test.describe("Tokens page", () => {
  test("shows tokens page with header", async ({ page }) => {
    await page.goto("/tokens");

    await expect(
      page.getByRole("heading", { name: /api tokens/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Manage API tokens for programmatic access"),
    ).toBeVisible();
  });

  test("can open create token dialog", async ({ page }) => {
    await page.goto("/tokens");
    await page.waitForLoadState("networkidle");

    // Use first() because there may be a header button and an empty-state button
    await page
      .getByRole("button", { name: "Create Token" })
      .first()
      .click();

    await expect(page.getByText("Create API Token")).toBeVisible();
    await expect(page.getByText("What are API tokens?")).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("can create a token and see it displayed", async ({ page }) => {
    await page.goto("/tokens");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("button", { name: "Create Token" })
      .first()
      .click();

    await page
      .getByPlaceholder("Describe what this token is used for")
      .fill("E2E test token");

    await page.getByRole("button", { name: "Generate Token" }).click();

    await expect(
      page.getByText("Token Created Successfully!"),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Your API Token")).toBeVisible();

    // Copy the token first - the dialog guards against closing the one-time
    // secret before it's been copied.
    await page.getByRole("button", { name: "Copy token to clipboard" }).click();

    await page.getByRole("button", { name: "Done" }).click();

    // Token should appear in the table (shown as ****<last4> in a chip)
    await expect(page.locator(".token-chip").first()).toBeVisible({
      timeout: 10000,
    });
    // Empty state should be gone
    await expect(page.getByText("No API tokens yet")).not.toBeVisible();
  });
});

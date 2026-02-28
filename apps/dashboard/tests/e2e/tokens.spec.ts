import { expect, test } from "@playwright/test";

test.describe("Tokens page", () => {
  test("shows tokens page with header", async ({ page }) => {
    await page.goto("/tokens");

    await expect(page.getByText("API Tokens")).toBeVisible();
    await expect(page.getByText("Manage API tokens for programmatic access")).toBeVisible();
  });

  test("can open create token dialog", async ({ page }) => {
    await page.goto("/tokens");

    await page.getByRole("button", { name: "Create Token" }).click();

    await expect(page.getByText("Create API Token")).toBeVisible();
    await expect(page.getByText("What are API tokens?")).toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("can create a token and see it displayed", async ({ page }) => {
    await page.goto("/tokens");

    await page.getByRole("button", { name: "Create Token" }).click();

    await page.getByPlaceholder("Describe what this token is used for").fill("E2E test token");

    await page.getByRole("button", { name: "Generate Token" }).click();

    await expect(page.getByText("Token Created Successfully!")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Your API Token")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByText("E2E test token")).toBeVisible();
  });
});

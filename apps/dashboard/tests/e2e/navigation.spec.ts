import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test("sidebar shows navigation links", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByText("Projects")).toBeVisible();
    await expect(page.getByText("API Tokens")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("can navigate between pages via sidebar", async ({ page }) => {
    await page.goto("/projects");

    // Navigate to Tokens
    await page.getByRole("link", { name: "API Tokens" }).click();
    await expect(page).toHaveURL(/\/tokens/);
    await expect(page.getByText("Manage API tokens for programmatic access")).toBeVisible();

    // Navigate to Settings (use sidebar specifically)
    await page.locator(".q-drawer").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/account/);

    // Navigate back to Projects
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects/);
  });

  test("unauthenticated users are redirected to login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/projects");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Welcome back")).toBeVisible();

    await context.close();
  });

  test("login page shows Google sign-in button", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/login");

    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("DeviceSDK")).toBeVisible();

    await context.close();
  });

  test("root URL redirects to projects", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/projects/);
  });
});

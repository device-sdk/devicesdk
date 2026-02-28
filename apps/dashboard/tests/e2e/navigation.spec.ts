import { expect, test } from "./fixtures";

test.describe("Navigation", () => {
  test("sidebar shows navigation links", async ({ page }) => {
    await page.goto("/projects");

    const drawer = page.locator(".q-drawer");
    await expect(drawer.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: "API Tokens" }),
    ).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("can navigate between pages via sidebar", async ({ page }) => {
    await page.goto("/projects");

    const drawer = page.locator(".q-drawer");

    // Navigate to Tokens
    await drawer.getByRole("link", { name: "API Tokens" }).click();
    await expect(page).toHaveURL(/\/tokens/);
    await expect(
      page.getByText("Manage API tokens for programmatic access"),
    ).toBeVisible();

    // Navigate to Settings
    await drawer.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/account/);

    // Navigate back to Projects
    await drawer.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects/);
  });

  test("unauthenticated users are redirected to login", async ({
    browser,
  }) => {
    // Create a context WITHOUT auth cookies
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/projects");

    // Should redirect to login (may take a moment for the SPA router guard)
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.getByText("Welcome back")).toBeVisible();

    await context.close();
  });

  test("login page shows Google sign-in button", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:9000/login");

    await expect(page.getByText("Continue with Google")).toBeVisible();
    await expect(page.getByText("DeviceSDK").first()).toBeVisible();

    await context.close();
  });

  test("root URL redirects to projects", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/projects/);
  });
});

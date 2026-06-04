import { expect, test } from "./fixtures";

test.describe("Terms page", () => {
  test("loads with heading and last updated date", async ({ browser }) => {
    // Terms page is public — no auth required
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:9000/terms");

    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Last updated: June 2026")).toBeVisible();

    await context.close();
  });

  test("renders all 12 section headings", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:9000/terms");
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible({ timeout: 10000 });

    const sections = [
      "1. Acceptance of Terms",
      "2. Description of Service",
      "3. User Accounts",
      "4. Acceptable Use",
      "5. Data and Privacy",
      "6. API Usage",
      "7. Intellectual Property",
      "8. Termination",
      "9. Disclaimer of Warranties",
      "10. Limitation of Liability",
      "11. Changes to Terms",
      "12. Contact",
    ];

    for (const section of sections) {
      await expect(page.getByRole("heading", { name: section })).toBeVisible();
    }

    await context.close();
  });

  test("back to login link navigates to login page", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto("http://localhost:9000/terms");
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible({ timeout: 10000 });

    await page.getByText("Back to Login").click();
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });
});

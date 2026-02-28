import { test as base } from "@playwright/test";

/**
 * Custom test fixture that removes vite-plugin-checker error overlays
 * which can intercept pointer events and block Playwright clicks.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      new MutationObserver(() => {
        for (const el of document.querySelectorAll(
          "vite-plugin-checker-error-overlay",
        )) {
          el.remove();
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";

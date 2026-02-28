import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const AUTH_DIR = path.resolve(__dirname, ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "session.json");

setup("authenticate", async ({ page }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await page.context().addCookies([
    {
      name: "devicesdk-session",
      value: "test-session-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);

  await page.context().storageState({ path: AUTH_FILE });
});

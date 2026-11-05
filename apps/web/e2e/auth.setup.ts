import { expect, test as setup } from "@playwright/test";
import { ADMIN, ADMIN_STATE, USER, USER_STATE } from "./fixtures";

/*
 * Signs in once per account through the real form and saves the session cookies, so the tests
 * reuse them instead of signing in every time (Better Auth rate-limits sign-ins in production).
 */

for (const [who, file] of [
  [USER, USER_STATE],
  [ADMIN, ADMIN_STATE],
] as const) {
  setup(`sign in as ${who.username}`, async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email or username").fill(who.username);
    await page.getByLabel("Password").fill(who.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
    await expect(page.getByRole("button", { name: "Account" }).first()).toBeVisible();
    await page.context().storageState({ path: file });
  });
}

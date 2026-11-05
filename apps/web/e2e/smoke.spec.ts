import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, BUILD_ID, PRODUCT_ID, USER_STATE } from "./fixtures";

async function noHorizontalScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    w: window.innerWidth,
  }));
  expect(sw, "page-level horizontal scroll").toBeLessThanOrEqual(w);
}

/** Serious/critical accessibility violations only (axe), so minor rules don't flake the suite. */
async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
    [],
  );
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test.describe("signed out", () => {
      test("home and sign-in page", async ({ page }) => {
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.goto("/sign-in");
        await expect(page.getByLabel("Email or username")).toBeVisible();
        await noHorizontalScroll(page);
        await expectAccessible(page);
      });
    });

    test.describe("signed in", () => {
      test.use({ storageState: USER_STATE });

      test("dashboard, product chart with tooltip, compare", async ({ page }) => {
        await page.goto("/");
        await expect(page.getByText("E2E build").first()).toBeVisible();
        await noHorizontalScroll(page);

        await page.goto(`/products/${PRODUCT_ID}`);
        await expect(page.getByRole("heading", { name: "AMD Ryzen 7 9800X3D" })).toBeVisible();
        const chart = page.locator(".recharts-surface").first();
        await expect(chart).toBeVisible({ timeout: 20_000 });
        const box = (await chart.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
        await expect(page.locator(".recharts-tooltip-wrapper").first()).toBeVisible();
        await noHorizontalScroll(page);
        await expectAccessible(page);

        await page.goto(`/compare?build=${BUILD_ID}`);
        // Grid on desktop, stacked cards on phones: whichever is shown.
        await expect(
          page.getByText("Radeon RX 9070 XT 16GB").filter({ visible: true }).first(),
        ).toBeVisible();
        await noHorizontalScroll(page);
        await expectAccessible(page);
      });
    });
  });
}

test.describe("admin area", () => {
  test("is a 404 for anonymous visitors, like any unknown page", async ({ page }) => {
    for (const path of ["/admin", "/admin/users", "/pt/admin/merchants"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test.describe("as a regular user", () => {
    test.use({ storageState: USER_STATE });
    test("is a 404", async ({ page }) => {
      const res = await page.goto("/admin/users");
      expect(res?.status()).toBe(404);
    });
  });

  test.describe("as an admin", () => {
    test.use({ storageState: ADMIN_STATE });
    test("is reachable", async ({ page }) => {
      const res = await page.goto("/admin/users");
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
      await noHorizontalScroll(page);
    });
  });
});

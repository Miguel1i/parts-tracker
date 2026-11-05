/**
 * Run with tsx (ESM; @parts/db uses import.meta) by `pnpm e2e`, before Playwright starts the
 * server (Playwright launches webServer before globalSetup, which would lock the file).
 * Recreates the throwaway e2e database: migrations, two merchants, two products with 60 days of
 * price history, an admin and a regular user (with passwords), and a build for the user.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import {
  appSettings,
  buildItems,
  builds,
  createDb,
  merchants,
  pricePoints,
  productMerchant,
  products,
  promoteAdmin,
  user,
  account,
} from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { ADMIN, BUILD_ID, PRODUCT_ID, USER } from "./fixtures";

const DAY = 86_400_000;

async function seed() {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(join(root, `e2e.db${suffix}`), { force: true });
  }
  const db = createDb(`file:${join(root, "e2e.db").replaceAll("\\", "/")}`);
  await runMigrations(db);
  await db.insert(appSettings).values({ id: 1, signupMode: "approval" });

  await db.insert(merchants).values([
    {
      id: "e2e-m1",
      name: "Shop One",
      slug: "shop-one",
      baseUrl: "https://shop-one.example",
      searchTemplate: "https://shop-one.example/s?q={q}",
      sortOrder: 0,
    },
    {
      id: "e2e-m2",
      name: "Shop Two",
      slug: "shop-two",
      baseUrl: "https://shop-two.example",
      searchTemplate: "https://shop-two.example/s?q={q}",
      shipping: 5,
      sortOrder: 1,
    },
  ]);
  await db.insert(products).values([
    {
      id: PRODUCT_ID,
      name: "AMD Ryzen 7 9800X3D",
      query: "9800X3D",
      category: "cpu",
      refPrice: 449,
    },
    {
      id: "e2e-gpu",
      name: "Radeon RX 9070 XT 16GB",
      query: "RX 9070 XT",
      category: "gpu",
      refPrice: 699,
    },
  ]);

  const now = Date.now();
  const points: (typeof pricePoints.$inferInsert)[] = [];
  const latest = new Map<string, number>();
  for (const [productId, base] of [
    [PRODUCT_ID, 460],
    ["e2e-gpu", 720],
  ] as const) {
    for (const [merchantId, offset] of [
      ["e2e-m1", 0],
      ["e2e-m2", 12],
    ] as const) {
      for (let d = 60; d >= 0; d--) {
        const price = Math.round((base + offset - d * 0.4 + ((d * 7) % 11)) * 100) / 100;
        points.push({
          productId,
          merchantId,
          ts: new Date(now - d * DAY),
          priceEur: price,
          currency: "EUR",
          shipping: merchantId === "e2e-m2" ? 5 : 0,
          inStock: d % 17 !== 3,
          url: `https://${merchantId === "e2e-m1" ? "shop-one" : "shop-two"}.example/p/${productId}`,
          title: productId,
        });
        latest.set(`${productId}:${merchantId}`, price);
      }
    }
  }
  await db.insert(pricePoints).values(points);
  for (const [key, price] of latest) {
    const [productId, merchantId] = key.split(":") as [string, string];
    await db.insert(productMerchant).values({
      productId,
      merchantId,
      autoUrl: `https://example.test/${productId}`,
      lastStatus: "ok",
      lastPriceEur: price,
      lastCheckedAt: new Date(now - 3_600_000),
    });
  }

  await promoteAdmin(db, ADMIN.email, {
    username: ADMIN.username,
    passwordHash: await hashPassword(ADMIN.password),
  });
  const [u] = await db
    .insert(user)
    .values({
      name: USER.username,
      email: USER.email,
      username: USER.username,
      displayUsername: USER.username,
      status: "active",
      role: "user",
    })
    .returning({ id: user.id });
  await db.insert(account).values({
    userId: u!.id,
    accountId: u!.id,
    providerId: "credential",
    password: await hashPassword(USER.password),
  });
  await db.insert(builds).values({ id: BUILD_ID, userId: u!.id, name: "E2E build" });
  await db.insert(buildItems).values([
    { buildId: BUILD_ID, productId: PRODUCT_ID, quantity: 1, sortOrder: 0 },
    { buildId: BUILD_ID, productId: "e2e-gpu", quantity: 1, sortOrder: 1 },
  ]);
  db.$client.close();
}

await seed();

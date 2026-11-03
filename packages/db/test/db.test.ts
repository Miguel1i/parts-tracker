import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/client";
import { countRows, importLegacy, LEGACY_ADMIN_USER_ID, seed } from "../src/import";
import type { LegacyFile } from "../src/legacy";
import { runMigrations } from "../src/migrate";
import {
  appSettings,
  blocklist,
  buildItems,
  builds,
  merchants,
  pricePoints,
  productIdentifiers,
  productMerchant,
  products,
} from "../src/schema";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/pc_tracker.fixture.json", import.meta.url), "utf8"),
) as LegacyFile;

// A temp file rather than :memory:, because libsql runs transactions on a separate
// connection and an in-memory DB would be empty there.
const dir = mkdtempSync(join(tmpdir(), "parts-db-"));
let db: Db;
let n = 0;

beforeEach(async () => {
  db = createDb(`file:${join(dir, `test-${n++}.db`).replaceAll("\\", "/")}`);
  await runMigrations(db);
});

afterEach(() => db.$client.close());

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file handle briefly; the OS temp cleaner gets it.
  }
});

describe("schema", () => {
  it("migrates and round-trips rows with defaults", async () => {
    const [m] = await db
      .insert(merchants)
      .values({
        name: "Shop",
        slug: "shop",
        baseUrl: "https://shop.pt",
        searchTemplate: "https://shop.pt/s?q={q}",
        adapterConfig: { throttleMs: 2000, selectors: { price: ".price" } },
      })
      .returning();
    expect(m).toMatchObject({
      currency: "EUR",
      enabled: true,
      visibleToUsers: true,
      ownOnly: false,
      needsBrowser: false,
      adapterConfig: { throttleMs: 2000, selectors: { price: ".price" } },
    });
    expect(m!.createdAt).toBeInstanceOf(Date);
    expect(Math.abs(m!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);

    const [p] = await db.insert(products).values({ name: "CPU", query: "cpu" }).returning();
    const ts = new Date("2026-11-03T11:35:00Z");
    await db
      .insert(pricePoints)
      .values({ productId: p!.id, merchantId: m!.id, ts, priceEur: 399.9 });
    const [pt] = await db.select().from(pricePoints);
    expect(pt).toMatchObject({ priceEur: 399.9, currency: "EUR", inStock: true, ts });
  });

  it("defaults signup mode to approval", async () => {
    await db.insert(appSettings).values({});
    const [s] = await db.select().from(appSettings);
    expect(s).toMatchObject({ id: 1, signupMode: "approval", cronIntervalHours: 6 });
  });

  it("enforces foreign keys and unique identifiers", async () => {
    await expect(
      db.insert(productIdentifiers).values({ productId: "missing", kind: "gtin", value: "1" }),
    ).rejects.toThrow();
    const [p] = await db.insert(products).values({ name: "CPU", query: "cpu" }).returning();
    await db.insert(productIdentifiers).values({ productId: p!.id, kind: "gtin", value: "1" });
    await expect(
      db.insert(productIdentifiers).values({ productId: p!.id, kind: "gtin", value: "1" }),
    ).rejects.toThrow();
  });

  it("indexes price points on (productId, merchantId, ts)", async () => {
    const rows = await db.all<{ name: string }>(
      "select name from pragma_index_list('price_points')",
    );
    expect(rows.map((r) => r.name)).toContain("price_points_pair_ts_idx");
    const cols = await db.all<{ name: string }>(
      "select name from pragma_index_info('price_points_pair_ts_idx')",
    );
    expect(cols.map((c) => c.name)).toEqual(["product_id", "merchant_id", "ts"]);
  });
});

describe("seed", () => {
  it("seeds the 12 legacy merchants and is idempotent", async () => {
    expect(await seed(db)).toEqual({ inserted: 12, updated: 0 });
    expect(await seed(db)).toEqual({ inserted: 0, updated: 12 });
    expect(await db.$count(merchants)).toBe(12);
    const [worten] = await db.select().from(merchants).where(eq(merchants.slug, "worten"));
    expect(worten).toMatchObject({ ownOnly: true, country: "PT" });
  });
});

describe("importLegacy", () => {
  it("imports the fixture into every table", async () => {
    const summary = await importLegacy(db, fixture);
    expect(summary).toMatchObject({
      merchants: { inserted: 4, updated: 0 },
      products: { inserted: 2, skipped: 0 },
      identifiers: 5,
      productMerchantPairs: 6,
      manualUrls: 2,
      autoUrls: 2,
      blocklist: 2,
      pricePoints: 5,
      buildItems: 2,
      bought: 1,
      warnings: [],
    });
    expect(await countRows(db)).toEqual({
      merchants: 4,
      products: 2,
      productIdentifiers: 5,
      productMerchant: 6,
      blocklist: 2,
      pricePoints: 5,
      builds: 1,
      buildItems: 2,
      userMerchants: 4,
    });

    const [build] = await db.select().from(builds);
    expect(build!.userId).toBe(LEGACY_ADMIN_USER_ID);

    const items = await db
      .select({ name: products.name, boughtPrice: buildItems.boughtPrice, shop: merchants.name })
      .from(buildItems)
      .innerJoin(products, eq(products.id, buildItems.productId))
      .leftJoin(merchants, eq(merchants.id, buildItems.boughtMerchantId))
      .orderBy(asc(buildItems.sortOrder));
    expect(items.map((i) => [i.boughtPrice, i.shop])).toEqual([
      [null, null],
      [279.9, "PCDiga"],
    ]);

    const [pcdiga] = await db.select().from(merchants).where(eq(merchants.name, "PCDiga"));
    const [cpu] = await db.select().from(products).where(eq(products.category, "cpu"));
    const history = await db
      .select()
      .from(pricePoints)
      .where(and(eq(pricePoints.productId, cpu!.id), eq(pricePoints.merchantId, pcdiga!.id)))
      .orderBy(asc(pricePoints.ts));
    expect(history.map((h) => [h.ts.toISOString(), h.priceEur, h.shipping])).toEqual([
      ["2026-11-03T11:35:00.000Z", 399.9, null],
      ["2026-11-03T15:51:00.000Z", 457, 17],
    ]);

    const [pair] = await db
      .select()
      .from(productMerchant)
      .where(
        and(eq(productMerchant.productId, cpu!.id), eq(productMerchant.merchantId, pcdiga!.id)),
      );
    expect(pair).toMatchObject({ lastStatus: "ok", lastPriceEur: 457 });
    expect(pair!.manualUrl).toContain("pcdiga.com");

    expect((await db.select().from(blocklist)).map((b) => b.name)).toContain(
      "CORSAIR SF750 (2024)",
    );
  });

  it("re-running skips existing products and never duplicates history", async () => {
    await importLegacy(db, fixture);
    const again = await importLegacy(db, fixture);
    expect(again.products).toEqual({ inserted: 0, skipped: 2 });
    expect(again.merchants).toEqual({ inserted: 0, updated: 4 });
    expect(await db.$count(pricePoints)).toBe(5);
    expect(await db.$count(builds)).toBe(1);
  });
});

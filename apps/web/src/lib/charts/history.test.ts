import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, merchants, pricePoints, products, user, userMerchants } from "@parts/db";
import { runMigrations } from "@parts/db/migrate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProductHistory, rangeStart } from "./history";

const dir = mkdtempSync(join(tmpdir(), "parts-history-"));
const db = createDb(`file:${join(dir, "t.db").replaceAll("\\", "/")}`);
const now = Date.UTC(2026, 5, 1);
const day = 86_400_000;

beforeAll(async () => {
  await runMigrations(db);
  await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", status: "active" });
  const base = { baseUrl: "https://x.example", searchTemplate: "https://x.example/?q={q}" };
  await db.insert(merchants).values([
    {
      id: "m1",
      name: "Alpha",
      slug: "alpha",
      sortOrder: 1,
      shipping: 5,
      freeShippingOver: 100,
      ...base,
    },
    { id: "m2", name: "Beta", slug: "beta", sortOrder: 2, shipping: 3, ...base },
    { id: "m3", name: "Hidden", slug: "hidden", sortOrder: 3, visibleToUsers: false, ...base },
    { id: "m4", name: "Off", slug: "off", sortOrder: 4, enabled: false, ...base },
  ]);
  await db.insert(userMerchants).values({ userId: "u1", merchantId: "m2", enabled: false });
  await db.insert(products).values([
    { id: "p1", name: "CPU", query: "cpu", refPrice: 300 },
    { id: "p2", name: "Old", query: "old", archived: true },
  ]);
  const pp = (merchantId: string, d: number, priceEur: number, extra = {}) => ({
    productId: "p1",
    merchantId,
    ts: new Date(now - d * day),
    priceEur,
    ...extra,
  });
  await db
    .insert(pricePoints)
    .values([
      pp("m1", 40, 90),
      pp("m1", 5, 120),
      pp("m2", 5, 80, { shipping: 7, inStock: false }),
      pp("m3", 5, 10),
      pp("m1", 1, 95, { url: "https://x.example/p", title: "T" }),
    ]);
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may hold the handle briefly.
  }
});

describe("rangeStart", () => {
  it("maps ranges to a start time", () => {
    expect(rangeStart("7d", now)).toBe(now - 7 * day);
    expect(rangeStart("30d", now)).toBe(now - 30 * day);
    expect(rangeStart("90d", now)).toBe(now - 90 * day);
    expect(rangeStart("1y", now)).toBe(now - 365 * day);
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("loadProductHistory", () => {
  it("is null for unknown or archived products", async () => {
    expect(
      await loadProductHistory(db, { productId: "nope", userId: null, from: null }),
    ).toBeNull();
    expect(await loadProductHistory(db, { productId: "p2", userId: null, from: null })).toBeNull();
  });

  it("without a user shows enabled, visible merchants with stable colours", async () => {
    const h = (await loadProductHistory(db, { productId: "p1", userId: null, from: null }))!;
    expect(h.product).toEqual({ id: "p1", name: "CPU", refPrice: 300 });
    expect(h.merchants.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(h.merchants[0]!.color).toBe("var(--chart-merchant-1)");
    expect(h.merchants[1]!.color).toBe("var(--chart-merchant-2)");
    expect(h.obs).toHaveLength(4);
  });

  it("with a user honours their merchant choices", async () => {
    const h = (await loadProductHistory(db, { productId: "p1", userId: "u1", from: null }))!;
    expect(h.merchants.map((m) => m.id)).toEqual(["m1"]);
    expect(h.obs.every((x) => x.merchantId === "m1")).toBe(true);
  });

  it("filters by range start, sorted by time", async () => {
    const h = (await loadProductHistory(db, {
      productId: "p1",
      userId: null,
      from: rangeStart("7d", now),
    }))!;
    expect(h.obs.map((x) => x.ts)).toEqual([...h.obs.map((x) => x.ts)].sort((a, b) => a - b));
    expect(h.obs).toHaveLength(3);
    expect(h.obs.at(-1)).toMatchObject({ url: "https://x.example/p", title: "T" });
  });

  it("computes shipping from the merchant rule unless one was stored", async () => {
    const h = (await loadProductHistory(db, { productId: "p1", userId: null, from: null }))!;
    const m1 = h.obs.filter((x) => x.merchantId === "m1");
    expect(m1.map((x) => [x.price, x.shipping])).toEqual([
      [90, 5],
      [120, 0],
      [95, 5],
    ]);
    const m2 = h.obs.find((x) => x.merchantId === "m2")!;
    expect(m2).toMatchObject({ shipping: 7, inStock: false });
  });

  it("zeroes shipping when withShipping is false", async () => {
    const h = (await loadProductHistory(db, {
      productId: "p1",
      userId: null,
      from: null,
      withShipping: false,
    }))!;
    expect(h.obs.every((x) => x.shipping === 0)).toBe(true);
  });
});

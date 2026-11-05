import { describe, expect, it } from "vitest";
import {
  bestPriceChanges,
  buildChartData,
  categorySlot,
  productSparks,
  topMovers,
  totalSpark,
} from "./dashboard";
import { DAY_MS, type Obs } from "./transforms";

const now = Date.UTC(2026, 5, 30);
const o = (merchantId: string, daysAgo: number, price: number, inStock = true): Obs => ({
  merchantId,
  ts: now - daysAgo * DAY_MS,
  price,
  shipping: 0,
  inStock,
});

describe("bestPriceChanges", () => {
  it("lists changes of the cheapest price, newest first, with the new merchant", () => {
    const list = bestPriceChanges(
      [
        { productId: "p1", name: "CPU", obs: [o("a", 10, 200), o("b", 3, 180), o("a", 1, 190)] },
        { productId: "p2", name: "GPU", obs: [o("a", 20, 500), o("a", 2, 450)] },
      ],
      { now, days: 14, withShipping: false, limit: 10 },
    );
    expect(list.map((c) => [c.productId, c.to, c.merchantId])).toEqual([
      ["p2", 450, "a"],
      ["p1", 180, "b"],
    ]);
    expect(list[1]!.delta).toBe(-20);
  });

  it("ignores changes older than the window and honours the limit", () => {
    const old = [o("a", 30, 100), o("a", 20, 90)];
    expect(
      bestPriceChanges([{ productId: "p", name: "X", obs: old }], {
        now,
        days: 14,
        withShipping: false,
        limit: 10,
      }),
    ).toEqual([]);
  });
});

describe("buildChartData", () => {
  const items = [
    { productId: "p1", quantity: 1, category: "cpu", refPrice: 250 },
    { productId: "p2", quantity: 2, category: "gpu", refPrice: null },
  ];
  const obs = new Map([
    ["p1", [o("a", 5, 200)]],
    ["p2", [o("a", 5, 100)]],
  ]);
  it("stacks by category in fixed order and sums reference prices", () => {
    const d = buildChartData(items, obs, false);
    expect(d.categories.map((c) => c.key)).toEqual(["cpu", "gpu"]);
    expect(d.refTotal).toBe(250);
    expect(d.anywhere[0]).toMatchObject({ total: 400, cpu: 200, gpu: 200 });
    expect(d.single[0]!.total).toBe(400);
  });
  it("gives each category a stable slot", () => {
    expect(categorySlot("cpu")).toBe(1);
    expect(categorySlot("gpu")).toBe(2);
  });
});

describe("sparks and movers", () => {
  it("sparkline of a total keeps only comparable points", () => {
    const totals = [
      { ts: now - 5 * DAY_MS, total: 100, byCategory: {}, missing: 1 },
      { ts: now - 2 * DAY_MS, total: 300, byCategory: {}, missing: 0 },
      { ts: now - 1 * DAY_MS, total: 290, byCategory: {}, missing: 0 },
    ];
    expect(totalSpark(totals, now)).toEqual([300, 290]);
  });
  it("per-product sparks carry the price forward", () => {
    const s = productSparks(new Map([["p", [o("a", 40, 10)]]]), ["p"], now, false);
    expect(s.p).toHaveLength(30);
    expect(s.p!.every((v) => v === 10)).toBe(true);
  });
  it("topMovers takes n drops and n rises", () => {
    const m = (pct: number) => ({
      productId: String(pct),
      name: "",
      from: 1,
      to: 1,
      delta: 0,
      pct,
    });
    const out = topMovers([m(-30), m(20), m(-10), m(5)], 1);
    expect(out.map((x) => x.pct)).toEqual([-30, 20]);
  });
});

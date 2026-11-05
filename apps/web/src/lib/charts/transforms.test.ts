import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  buildTotals,
  downsample,
  effective,
  lowestBand,
  movers,
  pctAboveBest,
  seriesStats,
  sparkline,
  stepSeries,
  summarize,
  type Obs,
} from "./transforms";

const D = DAY_MS;
const o = (m: string, day: number, price: number, extra: Partial<Obs> = {}): Obs => ({
  merchantId: m,
  ts: day * D,
  price,
  shipping: 0,
  inStock: true,
  ...extra,
});

describe("effective", () => {
  it("adds shipping only when asked", () => {
    expect(effective({ price: 100, shipping: 5 }, true)).toBe(105);
    expect(effective({ price: 100, shipping: 5 }, false)).toBe(100);
  });
});

describe("stepSeries", () => {
  it("is empty for no input", () => {
    expect(stepSeries([], { withShipping: true, gapMs: D }).size).toBe(0);
  });

  it("sorts per merchant and applies shipping", () => {
    const s = stepSeries([o("a", 2, 90, { shipping: 5 }), o("a", 1, 100), o("b", 1, 80)], {
      withShipping: true,
      gapMs: 10 * D,
    });
    expect(s.get("a")!.map((p) => [p.ts, p.value])).toEqual([
      [D, 100],
      [2 * D, 95],
    ]);
    expect(s.get("b")).toHaveLength(1);
    const plain = stepSeries([o("a", 1, 100, { shipping: 5 })], { withShipping: false, gapMs: D });
    expect(plain.get("a")![0]!.value).toBe(100);
  });

  it("inserts a null after the earlier point when the gap is too long", () => {
    const pts = stepSeries([o("a", 0, 100), o("a", 5, 90), o("a", 6, 91)], {
      withShipping: false,
      gapMs: 2 * D,
    }).get("a")!;
    expect(pts.map((p) => [p.ts / D, p.value])).toEqual([
      [0, 100],
      [2, null],
      [5, 90],
      [6, 91],
    ]);
  });

  it("does not insert a null for exactly gapMs", () => {
    const pts = stepSeries([o("a", 0, 1), o("a", 2, 2)], { withShipping: false, gapMs: 2 * D });
    expect(pts.get("a")).toHaveLength(2);
  });

  it("keeps out-of-stock points with their flag", () => {
    const pts = stepSeries([o("a", 0, 1, { inStock: false })], { withShipping: false, gapMs: D });
    expect(pts.get("a")![0]).toMatchObject({ value: 1, inStock: false });
  });
});

describe("lowestBand", () => {
  const opts = { withShipping: false, staleMs: 7 * D };
  it("is empty for no input", () => expect(lowestBand([], opts)).toEqual([]));

  it("tracks the cheapest merchant with carry-forward", () => {
    const band = lowestBand([o("a", 0, 100), o("b", 1, 90), o("a", 2, 80)], opts);
    expect(band.map((b) => [b.ts / D, b.min, b.merchantId])).toEqual([
      [0, 100, "a"],
      [1, 90, "b"],
      [2, 80, "a"],
    ]);
  });

  it("ignores out-of-stock observations", () => {
    const band = lowestBand([o("a", 0, 100), o("b", 1, 50, { inStock: false })], opts);
    expect(band[1]).toMatchObject({ min: 100, merchantId: "a" });
  });

  it("is null when nothing is in stock", () => {
    expect(lowestBand([o("a", 0, 100, { inStock: false })], opts)[0]).toMatchObject({
      min: null,
      merchantId: null,
    });
  });

  it("drops stale merchants", () => {
    const band = lowestBand([o("a", 0, 50), o("b", 10, 100)], opts);
    expect(band[1]).toMatchObject({ min: 100, merchantId: "b" });
  });

  it("breaks ties by merchant id and honours shipping", () => {
    expect(lowestBand([o("b", 0, 10), o("a", 0, 10)], opts)[0]!.merchantId).toBe("a");
    const withShip = lowestBand([o("a", 0, 10, { shipping: 5 }), o("b", 0, 12)], {
      ...opts,
      withShipping: true,
    });
    expect(withShip[0]).toMatchObject({ min: 12, merchantId: "b" });
  });
});

describe("seriesStats", () => {
  it("handles empty and all-null input", () => {
    const empty = { min: null, max: null, avg: null, last: null };
    expect(seriesStats([])).toEqual(empty);
    expect(seriesStats([{ ts: 1, value: null }])).toEqual(empty);
  });

  it("ignores nulls", () => {
    expect(
      seriesStats([
        { ts: 1, value: 10 },
        { ts: 2, value: null },
        { ts: 3, value: 30 },
        { ts: 4, value: 20 },
      ]),
    ).toEqual({
      min: { value: 10, ts: 1 },
      max: { value: 30, ts: 3 },
      avg: 20,
      last: { value: 20, ts: 4 },
    });
  });

  it("keeps the earliest of tied minima", () => {
    const s = seriesStats([
      { ts: 1, value: 5 },
      { ts: 2, value: 5 },
    ]);
    expect(s.min!.ts).toBe(1);
  });
});

describe("downsample", () => {
  const hourly = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ts: i * 3_600_000,
      value: 100 + ((i * 37) % 50) - (i === 777 ? 1000 : 0),
    }));

  it("returns short series untouched", () => {
    const pts = hourly(10);
    expect(downsample(pts, 500)).toBe(pts);
  });

  it("keeps the all-time low and the last point, within the budget", () => {
    const pts = hourly(24 * 60);
    const out = downsample(pts, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(Math.min(...out.map((p) => p.value))).toBe(Math.min(...pts.map((p) => p.value)));
    expect(out[out.length - 1]).toBe(pts[pts.length - 1]);
    expect(out.every((p) => pts.includes(p))).toBe(true);
  });

  it("keeps daily min and close", () => {
    const pts = [5, 3, 9, 7].map((value, i) => ({ ts: i * 1000, value }));
    const out = downsample(pts, 2);
    expect(out.map((p) => p.value)).toEqual([3, 7]);
  });

  it("widens buckets when daily min+close is still too many", () => {
    const pts = Array.from({ length: 800 }, (_, i) => ({
      ts: i * 12 * 3_600_000,
      value: 100 - (i % 7),
    }));
    expect(downsample(pts, 500).length).toBeLessThanOrEqual(500);
  });

  it("preserves a gap marker per bucket", () => {
    const pts = [
      { ts: 0, value: 5 as number | null },
      { ts: 1000, value: null },
      { ts: 2000, value: 4 },
      { ts: 3000, value: 6 },
    ];
    expect(downsample(pts, 3).some((p) => p.value == null)).toBe(true);
  });
});

describe("buildTotals", () => {
  const opts = { withShipping: false, staleMs: 7 * D };
  const items = [
    { productId: "cpu", quantity: 1, category: "cpu" },
    { productId: "ram", quantity: 2, category: null },
  ];

  it("is empty without items", () => {
    expect(buildTotals([], new Map(), { ...opts, mode: "anywhere" })).toEqual([]);
  });

  it("anywhere sums the cheapest per product and counts missing parts", () => {
    const obs = new Map([
      ["cpu", [o("a", 0, 300), o("b", 1, 280)]],
      ["ram", [o("a", 1, 50)]],
    ]);
    const t = buildTotals(items, obs, { ...opts, mode: "anywhere" });
    expect(t.map((x) => [x.ts / D, x.total, x.missing])).toEqual([
      [0, 300, 1],
      [1, 380, 0],
    ]);
    expect(t[1]!.byCategory).toEqual({ cpu: 280, uncategorized: 100 });
  });

  it("anywhere is null when nothing is priced", () => {
    const obs = new Map([["cpu", [o("a", 0, 300, { inStock: false })]]]);
    const t = buildTotals(items, obs, { ...opts, mode: "anywhere" });
    expect(t[0]).toMatchObject({ total: null, missing: 2 });
  });

  it("singleMerchant picks the cheapest shop that has everything", () => {
    const obs = new Map([
      ["cpu", [o("a", 0, 300), o("b", 0, 290)]],
      ["ram", [o("a", 0, 50), o("c", 0, 10)]],
    ]);
    const t = buildTotals(items, obs, { ...opts, mode: "singleMerchant" });
    expect(t[0]!.total).toBe(400);
    expect(t[0]!.byCategory).toEqual({ cpu: 300, uncategorized: 100 });
  });

  it("singleMerchant is null when no shop has every part in stock", () => {
    const obs = new Map([
      ["cpu", [o("a", 0, 300)]],
      ["ram", [o("b", 0, 50)]],
    ]);
    const t = buildTotals(items, obs, { ...opts, mode: "singleMerchant" });
    expect(t[0]!.total).toBeNull();
  });

  it("applies the shipping toggle", () => {
    const obs = new Map([["cpu", [o("a", 0, 100, { shipping: 10 })]]]);
    const one = [{ productId: "cpu", quantity: 1, category: "cpu" }];
    const t = buildTotals(one, obs, { ...opts, withShipping: true, mode: "anywhere" });
    expect(t[0]!.total).toBe(110);
  });
});

describe("movers", () => {
  const now = 100 * D;
  const opts = { days: 30, now, withShipping: false };
  it("computes change vs. the carried-forward value, biggest |pct| first", () => {
    const res = movers(
      [
        { productId: "1", name: "A", obs: [o("a", 10, 100), o("a", 90, 90)] },
        { productId: "2", name: "B", obs: [o("a", 10, 100), o("a", 90, 150)] },
        { productId: "3", name: "C", obs: [o("a", 10, 100)] },
      ],
      opts,
    );
    expect(res.map((m) => [m.productId, Math.round(m.pct)])).toEqual([
      ["2", 50],
      ["1", -10],
      ["3", 0],
    ]);
    expect(res[1]).toMatchObject({ from: 100, to: 90, delta: -10 });
  });

  it("excludes products without a value at either end", () => {
    const res = movers(
      [
        { productId: "new", name: "N", obs: [o("a", 95, 10)] },
        { productId: "oos", name: "O", obs: [o("a", 10, 10), o("a", 95, 10, { inStock: false })] },
        { productId: "none", name: "X", obs: [] },
      ],
      opts,
    );
    expect(res).toEqual([]);
  });
});

describe("sparkline", () => {
  it("samples the carried-forward cheapest price", () => {
    const s = sparkline([o("a", 8, 100), o("b", 9, 90)], {
      days: 4,
      now: 10 * D,
      withShipping: false,
      points: 30,
    });
    expect(s).toHaveLength(4);
    expect(s.at(-1)).toEqual({ ts: 10 * D, value: 90 });
    expect(s.map((p) => p.value)).toEqual([null, 100, 90, 90]);
  });

  it("caps the number of samples", () => {
    const s = sparkline([o("a", 0, 1)], {
      days: 90,
      now: 100 * D,
      withShipping: false,
      points: 30,
    });
    expect(s).toHaveLength(30);
  });

  it("is all null without data", () => {
    const s = sparkline([], { days: 7, now: 10 * D, withShipping: true });
    expect(s.every((p) => p.value === null)).toBe(true);
  });
});

describe("pctAboveBest", () => {
  it("measures against the row minimum and keeps nulls", () => {
    expect(pctAboveBest([100, 110, null, 150])).toEqual([0, 10, null, 50]);
    expect(pctAboveBest([null, null])).toEqual([null, null]);
    expect(pctAboveBest([])).toEqual([]);
  });
});

describe("summarize", () => {
  const formatPrice = (n: number) => `€${n.toFixed(2)}`;
  const lowest = { price: 399.9, merchantName: "PCDiga" };
  it("describes the lowest price and trend", () => {
    expect(summarize({ lowest, changePct: -6.2, days: 30, formatPrice })).toBe(
      "Lowest €399.90 at PCDiga, down 6% in 30 days",
    );
    expect(summarize({ lowest, changePct: 12, days: 7, formatPrice })).toBe(
      "Lowest €399.90 at PCDiga, up 12% in 7 days",
    );
    expect(summarize({ lowest, changePct: 0.2, days: 7, formatPrice })).toContain("unchanged");
  });
  it("handles missing data and custom text", () => {
    expect(summarize({ lowest, changePct: null, days: 30, formatPrice })).toBe(
      "Lowest €399.90 at PCDiga",
    );
    expect(summarize({ lowest: null, changePct: null, days: 30, formatPrice })).toBe(
      "No price data yet",
    );
    const pt = {
      lowest: (p: string, m: string) => `Mais baixo ${p} em ${m}`,
      down: (p: number) => `menos ${p}%`,
      up: (p: number) => `mais ${p}%`,
      flat: () => "igual",
      none: () => "Sem dados",
    };
    expect(summarize({ lowest, changePct: -3, days: 30, formatPrice }, pt)).toBe(
      "Mais baixo €399.90 em PCDiga, menos 3%",
    );
  });
});

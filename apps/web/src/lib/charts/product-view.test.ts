import { describe, expect, it } from "vitest";
import {
  buildCsv,
  mergeSeries,
  parseViewState,
  pointAt,
  safeHttpUrl,
  serializeViewState,
} from "./product-view";
import type { SeriesPoint } from "./transforms";

const pt = (ts: number, value: number | null, inStock = true, title?: string): SeriesPoint => ({
  ts,
  value,
  inStock,
  ...(value == null
    ? {}
    : {
        obs: {
          merchantId: "a",
          ts,
          price: value,
          shipping: 2,
          inStock,
          title: title ?? null,
          url: "https://x.test/p",
        },
      }),
});

describe("view state", () => {
  it("round-trips and omits defaults", () => {
    expect(serializeViewState({ range: "30d", hidden: [], shipping: null })).toBe("");
    const q = serializeViewState({ range: "1y", hidden: ["b", "a"], shipping: false });
    expect(q).toBe("range=1y&hide=a%2Cb&ship=0");
    expect(parseViewState(new URLSearchParams(q))).toEqual({
      range: "1y",
      hidden: ["a", "b"],
      shipping: false,
    });
  });
  it("ignores junk", () => {
    expect(parseViewState({ range: "5y", hide: "ok,<x>", ship: "2" })).toEqual({
      range: "30d",
      hidden: ["ok"],
      shipping: null,
    });
  });
});

describe("mergeSeries", () => {
  it("carries values forward and splits out-of-stock stretches", () => {
    const rows = mergeSeries({
      a: [pt(1, 10), pt(3, 12, false), pt(5, 11)],
      b: [pt(2, 20)],
    });
    expect(rows.map((r) => r.ts)).toEqual([1, 2, 3, 5]);
    expect(rows.map((r) => r.a)).toEqual([10, 10, 10, 11]);
    expect(rows.map((r) => r["a~oos"])).toEqual([null, null, 12, 12]);
    expect(rows.map((r) => r.b)).toEqual([null, 20, 20, 20]);
  });
  it("does not bridge gaps", () => {
    const rows = mergeSeries({ a: [pt(1, 10), pt(2, null), pt(9, 11)] }, [{ ts: 5, min: 7 }]);
    expect(rows.map((r) => r.ts)).toEqual([1, 2, 5, 9]);
    expect(rows.map((r) => r.a)).toEqual([10, 10, null, 11]);
    expect(rows.map((r) => r.band)).toEqual([null, null, 7, 7]);
  });
});

describe("pointAt", () => {
  it("finds the point in force", () => {
    const pts = [pt(1, 1), pt(5, 2)];
    expect(pointAt(pts, 0)).toBeNull();
    expect(pointAt(pts, 4)?.ts).toBe(1);
    expect(pointAt(pts, 5)?.ts).toBe(5);
  });
});

describe("buildCsv", () => {
  it("escapes, neutralises formulas and honours the window", () => {
    const csv = buildCsv(
      { a: [pt(1000, 10, true, "=SUM(1), x"), pt(9000, 11)] },
      [{ id: "a", name: "Shop, A" }],
      { to: 5000 },
    );
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '1970-01-01T00:00:01.000Z,"Shop, A",10,2,true,"\'=SUM(1), x",https://x.test/p',
    );
  });
});

describe("safeHttpUrl", () => {
  it("allows http(s) only", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://a.test")).toBe("https://a.test");
  });
});

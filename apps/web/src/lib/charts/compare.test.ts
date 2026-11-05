import { describe, expect, it } from "vitest";
import {
  buildCompareRows,
  cardOrder,
  heatBin,
  parseHide,
  safeShopUrl,
  serializeHide,
  type RawCell,
} from "./compare";

const cell = (productId: string, merchantId: string, over: Partial<RawCell> = {}): RawCell => ({
  productId,
  merchantId,
  status: "ok",
  price: 100,
  total: 100,
  url: null,
  checkedAt: null,
  ...over,
});

describe("buildCompareRows", () => {
  const products = [{ id: "p1", name: "GPU" }];

  it("marks the cheapest in-stock cell and computes % above best", () => {
    const [row] = buildCompareRows(
      products,
      ["a", "b", "c"],
      [
        cell("p1", "a", { total: 110 }),
        cell("p1", "b", { total: 100 }),
        cell("p1", "c", { total: 50, status: "out_of_stock" }),
      ],
    );
    expect(row!.bestTotal).toBe(100);
    expect(row!.bestMerchantIds).toEqual(["b"]);
    expect(row!.cells.a!.pct).toBeCloseTo(10);
    expect(row!.cells.b!.isBest).toBe(true);
    expect(row!.cells.c!.inStock).toBe(false);
    expect(row!.cells.c!.pct).toBeNull();
  });

  it("highlights ties and tolerates missing pairs", () => {
    const [row] = buildCompareRows(products, ["a", "b", "c"], [cell("p1", "a"), cell("p1", "b")]);
    expect(row!.bestMerchantIds).toEqual(["a", "b"]);
    expect(row!.cells.c).toBeUndefined();
  });

  it("has no best without in-stock offers", () => {
    const [row] = buildCompareRows(products, ["a"], [cell("p1", "a", { status: "blocked" })]);
    expect(row!.bestTotal).toBeNull();
    expect(row!.bestMerchantIds).toEqual([]);
  });

  it("ignores hidden merchants when finding the best", () => {
    const cells = [cell("p1", "a", { total: 80 }), cell("p1", "b", { total: 100 })];
    const [row] = buildCompareRows(products, ["b"], cells);
    expect(row!.bestTotal).toBe(100);
  });
});

describe("heatBin", () => {
  it("bins from best (1) to 60%+ (7)", () => {
    expect(heatBin(0)).toBe(1);
    expect(heatBin(0.49)).toBe(1);
    expect(heatBin(0.5)).toBe(2);
    expect(heatBin(4.9)).toBe(2);
    expect(heatBin(5)).toBe(3);
    expect(heatBin(19.9)).toBe(4);
    expect(heatBin(34)).toBe(5);
    expect(heatBin(59)).toBe(6);
    expect(heatBin(60)).toBe(7);
    expect(heatBin(900)).toBe(7);
  });
});

describe("cardOrder", () => {
  it("sorts by price, then unpriced, then missing", () => {
    const ids = ["a", "b", "c", "d"];
    const [row] = buildCompareRows([{ id: "p1", name: "x" }], ids, [
      cell("p1", "a", { total: 120 }),
      cell("p1", "b", { total: 100 }),
      cell("p1", "c", { status: "error", total: null, price: null }),
    ]);
    expect(cardOrder(row!, ids)).toEqual(["b", "a", "c", "d"]);
  });
});

describe("safeShopUrl", () => {
  it("allows only http(s)", () => {
    expect(safeShopUrl("https://shop.pt/p")).toBe("https://shop.pt/p");
    expect(safeShopUrl("javascript:alert(1)")).toBeNull();
    expect(safeShopUrl("data:text/html,x")).toBeNull();
    expect(safeShopUrl("nope")).toBeNull();
    expect(safeShopUrl(null)).toBeNull();
  });
});

describe("hide param", () => {
  it("parses, dedupes and drops unknown ids", () => {
    expect(parseHide("a,b,a,zzz", ["a", "b", "c"])).toEqual(["a", "b"]);
    expect(parseHide(["a", "c"], ["a", "c"])).toEqual(["a", "c"]);
    expect(parseHide(undefined, ["a"])).toEqual([]);
  });
  it("serializes empty as undefined", () => {
    expect(serializeHide([])).toBeUndefined();
    expect(serializeHide(["a", "b"])).toBe("a,b");
  });
});

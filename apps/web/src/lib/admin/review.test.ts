import { describe, expect, it } from "vitest";
import { blocklistExternalId, identifiersToConfirm, isHttpUrl } from "./review";

describe("isHttpUrl", () => {
  it("accepts only http(s)", () => {
    expect(isHttpUrl("https://a.pt/x")).toBe(true);
    expect(isHttpUrl("HTTP://a.pt")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,x")).toBe(false);
    expect(isHttpUrl("//a.pt")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl("")).toBe(false);
  });
});

describe("identifiersToConfirm", () => {
  it("normalizes valid GTINs, skips invalid, adds mpn and asin", () => {
    const out = identifiersToConfirm({
      gtins: ["4006381333931", "04006381333931", "1234567890123", "abc"],
      mpn: " 100-100000910WOF ",
      asin: "B0ABC12345",
      sku: "ignored",
    });
    expect(out).toEqual([
      { kind: "gtin", value: "04006381333931" },
      { kind: "mpn", value: "100-100000910WOF" },
      { kind: "asin", value: "B0ABC12345" },
    ]);
  });
  it("handles missing page data", () => {
    expect(identifiersToConfirm(undefined)).toEqual([]);
    expect(identifiersToConfirm({ gtins: [] })).toEqual([]);
  });
});

describe("blocklistExternalId", () => {
  it("prefers asin, then sku, else null", () => {
    expect(blocklistExternalId({ gtins: [], asin: "B1", sku: "S1" })).toBe("B1");
    expect(blocklistExternalId({ gtins: [], sku: "S1" })).toBe("S1");
    expect(blocklistExternalId({ gtins: [] })).toBeNull();
    expect(blocklistExternalId(null)).toBeNull();
  });
});

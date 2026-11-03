import { describe, expect, it } from "vitest";
import { gtinCheckDigit, gtinToEan13, gtinToUpc, isValidGtin, normalizeGtin } from "./gtin";

describe("gtinCheckDigit", () => {
  it("computes EAN-13 check digits", () => {
    expect(gtinCheckDigit("560662888512")).toBe(5);
    expect(gtinCheckDigit("400638133393")).toBe(1);
  });
  it("computes UPC-A check digits", () => {
    expect(gtinCheckDigit("84044049516")).toBe(1);
    expect(gtinCheckDigit("03600029145")).toBe(2);
  });
  it("rejects non-digits", () => {
    expect(() => gtinCheckDigit("12a")).toThrow();
  });
});

describe("normalizeGtin", () => {
  it("pads EAN-13 to 14 digits", () => {
    expect(normalizeGtin("5606628885125")).toBe("05606628885125");
  });
  it("pads UPC-12 to 14 digits (same number as its EAN-13 form)", () => {
    expect(normalizeGtin("840440495161")).toBe("00840440495161");
    expect(normalizeGtin("0840440495161")).toBe("00840440495161");
  });
  it("keeps a valid GTIN-14", () => {
    expect(normalizeGtin("10012345678902")).toBe("10012345678902");
  });
  it("accepts EAN-8", () => {
    expect(normalizeGtin("96385074")).toBe("00000096385074");
  });
  it("strips spaces and dashes", () => {
    expect(normalizeGtin(" 5 606628-885125 ")).toBe("05606628885125");
  });
  it("rejects a bad check digit", () => {
    expect(normalizeGtin("5606628885126")).toBeNull();
  });
  it("rejects wrong lengths, letters, empty and all zeros", () => {
    expect(normalizeGtin("12345")).toBeNull();
    expect(normalizeGtin("100-100001084WOF")).toBeNull();
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin(null)).toBeNull();
    expect(normalizeGtin("00000000000000")).toBeNull();
  });
});

describe("conversions", () => {
  it("round-trips UPC-12 ↔ EAN-13 ↔ GTIN-14", () => {
    const g = normalizeGtin("840440495161")!;
    expect(gtinToEan13(g)).toBe("0840440495161");
    expect(gtinToUpc(g)).toBe("840440495161");
    expect(normalizeGtin(gtinToEan13(g)!)).toBe(g);
  });
  it("has no UPC form for a non-US EAN-13", () => {
    const g = normalizeGtin("4711377290623")!;
    expect(gtinToEan13(g)).toBe("4711377290623");
    expect(gtinToUpc(g)).toBeNull();
  });
  it("has no EAN-13 form for a GTIN-14 with an indicator digit", () => {
    expect(gtinToEan13("10012345678902")).toBeNull();
  });
  it("isValidGtin", () => {
    expect(isValidGtin("4713294230454")).toBe(true);
    expect(isValidGtin("4713294230455")).toBe(false);
  });
});

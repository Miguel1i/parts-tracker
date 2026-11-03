import { describe, expect, it } from "vitest";
import { parsePrice } from "./price";

describe("parsePrice", () => {
  it.each([
    ["399,90 €", 399.9],
    ["1.234,56 €", 1234.56],
    ["1,234.56", 1234.56],
    ["€ 1 234,56", 1234.56],
    ["1.299", 1299],
    ["1,299", 1299],
    ["428.31", 428.31],
    ["£440.76", 440.76],
    [399.9, 399.9],
  ])("%s → %s", (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it.each([null, undefined, "", "Grátis", Number.NaN])("%s → null", (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

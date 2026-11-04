import { describe, expect, it } from "vitest";
import { emptyAdapterFields, mergeAdapterConfig, splitAdapterConfig } from "./adapter-schema";

describe("mergeAdapterConfig", () => {
  it("returns an empty config for blank input", () => {
    expect(mergeAdapterConfig(emptyAdapterFields(), "")).toEqual({ ok: true, config: {} });
  });

  it("builds from fields and merges overrides", () => {
    const f = emptyAdapterFields();
    f.selectors.price = " .price ";
    f.sellerRule.ownNames = "Amazon, Amazon EU ,";
    f.throttleMs = "2000";
    const r = mergeAdapterConfig(f, '{"custom": {"a": 1}}');
    expect(r).toEqual({
      ok: true,
      config: {
        selectors: { price: ".price" },
        sellerRule: { ownNames: ["Amazon", "Amazon EU"] },
        throttleMs: 2000,
        custom: { a: 1 },
      },
    });
  });

  it("rejects bad JSON, non-objects and bad numbers", () => {
    const f = emptyAdapterFields();
    expect(mergeAdapterConfig(f, "{").ok).toBe(false);
    expect(mergeAdapterConfig(f, "[]").ok).toBe(false);
    f.throttleMs = "100";
    expect(mergeAdapterConfig(f, "").ok).toBe(false);
    f.throttleMs = "abc";
    expect(mergeAdapterConfig(f, "").ok).toBe(false);
    f.throttleMs = "";
    f.maxConcurrency = "3";
    expect(mergeAdapterConfig(f, "").ok).toBe(false);
  });

  it("round-trips through splitAdapterConfig", () => {
    const config = {
      selectors: { item: ".i" },
      sellerRule: { thirdPartyMarkers: ["x", "y"] },
      maxConcurrency: 1,
      extra: true,
    };
    const { fields, overrides } = splitAdapterConfig(config);
    expect(mergeAdapterConfig(fields, overrides)).toEqual({ ok: true, config });
  });
});

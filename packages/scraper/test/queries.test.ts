import { describe, expect, it } from "vitest";
import { cpu } from "../../core/test/products";
import { parseEcbXml } from "../src/fx";
import { amazonProductUrl, buildSearchUrl, productAsin, searchQueries } from "../src/queries";
import { merchantHealth, shippingFor, truncateTrace } from "../src/store";

describe("buildSearchUrl", () => {
  it("uses + for spaces in a query string", () => {
    expect(buildSearchUrl("https://www.amazon.es/s?k={q}", "AMD Ryzen 7 9800X3D")).toBe(
      "https://www.amazon.es/s?k=AMD+Ryzen+7+9800X3D",
    );
  });
  it("percent-encodes in a path", () => {
    expect(buildSearchUrl("https://www.radiopopular.pt/pesquisa/{q}", "AMD Ryzen 7")).toBe(
      "https://www.radiopopular.pt/pesquisa/AMD%20Ryzen%207",
    );
  });
  it("encodes reserved characters", () => {
    expect(buildSearchUrl("https://x.pt/?s={q}&t=1", "G.Skill 2x16 & co")).toBe(
      "https://x.pt/?s=G.Skill+2x16+%26+co&t=1",
    );
  });
});

describe("searchQueries", () => {
  it("orders GTIN (as EAN-13), MPN, then text", () => {
    expect(searchQueries(cpu)).toEqual([
      { kind: "gtin", q: "5606628885125" },
      { kind: "mpn", q: "100-100001084WOF" },
      { kind: "text", q: "AMD Ryzen 7 9800X3D" },
    ]);
  });
  it("prefers user codes and skips codes with no confidence left", () => {
    const q = searchQueries({
      ...cpu,
      identifiers: [
        {
          kind: "gtin",
          value: "05606628885125",
          source: "learned",
          confirmed: false,
          confidence: 0,
        },
        { kind: "gtin", value: "00730143315289", source: "user", confirmed: true },
      ],
    });
    expect(q[0]).toEqual({ kind: "gtin", q: "0730143315289" });
    expect(q).toHaveLength(2);
  });
});

describe("ASIN reuse", () => {
  it("takes the ASIN identifier, else one from an Amazon URL", () => {
    expect(productAsin(cpu, [])).toBe("B0DKFMSMYK");
    const noAsin = { ...cpu, identifiers: [] };
    expect(productAsin(noAsin, ["https://www.amazon.co.uk/dp/B0DKFMSMYK?th=1"])).toBe("B0DKFMSMYK");
    expect(productAsin(noAsin, ["https://www.globaldata.pt/x/B0DKFMSMYK.html"])).toBeNull();
    expect(amazonProductUrl("https://www.amazon.fr", "B0DKFMSMYK")).toBe(
      "https://www.amazon.fr/dp/B0DKFMSMYK",
    );
  });
});

describe("helpers", () => {
  it("parses the ECB daily file", () => {
    const xml = `<Cube time='2026-11-03'><Cube currency='USD' rate='1.0812'/><Cube currency='GBP' rate='0.8431'/></Cube>`;
    expect(parseEcbXml(xml)).toEqual({ USD: 1.0812, GBP: 0.8431 });
  });
  it("applies free shipping over the threshold", () => {
    expect(shippingFor({ shipping: 17, freeShippingOver: null }, 450)).toBe(17);
    expect(shippingFor({ shipping: 17, freeShippingOver: 300 }, 450)).toBe(0);
  });
  it("rates merchant health", () => {
    expect(merchantHealth(["ok", "not_found"])).toBe("ok");
    expect(merchantHealth(["ok", "blocked"])).toBe("degraded");
    expect(merchantHealth(["blocked", "blocked"])).toBe("blocked");
    expect(merchantHealth([])).toBeNull();
  });
  it("truncates long traces in the middle", () => {
    const t = truncateTrace(
      Array.from({ length: 2000 }, (_, i) => `line ${i}`),
      1000,
    );
    expect(t.length).toBeLessThan(1100);
    expect(t).toContain("line 0");
    expect(t).toContain("line 1999");
    expect(t).toContain("chars cut");
  });
});

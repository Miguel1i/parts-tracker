import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  asinFromUrl,
  countryFromUrl,
  inferCategory,
  mapLegacy,
  mapStatus,
  parseBoughtDate,
  parseHistoryTime,
  parsePriceTime,
  slugify,
  type LegacyFile,
} from "../src/legacy";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/pc_tracker.fixture.json", import.meta.url), "utf8"),
) as LegacyFile;

describe("helpers", () => {
  it("slugifies merchant names", () => {
    expect(slugify("PCComponentes PT")).toBe("pccomponentes-pt");
    expect(slugify("Amazon.co.uk")).toBe("amazon-co-uk");
    expect(slugify("Rádio Popular")).toBe("radio-popular");
  });

  it("derives the country from the TLD", () => {
    expect(countryFromUrl("https://www.worten.pt/search?q={q}")).toBe("PT");
    expect(countryFromUrl("https://www.amazon.co.uk/s?k={q}")).toBe("GB");
    expect(countryFromUrl("https://www.pccomponentes.com/search/")).toBeNull();
  });

  it("parses Lisbon local times to UTC (winter = UTC, summer = UTC+1)", () => {
    expect(parseHistoryTime("2026-11-03T11:35")?.toISOString()).toBe("2026-11-03T11:35:00.000Z");
    expect(parseHistoryTime("2026-07-15T10:00")?.toISOString()).toBe("2026-07-15T09:00:00.000Z");
    expect(parseHistoryTime("garbage")).toBeNull();
    expect(parsePriceTime("03/11 15:51", 2026)?.toISOString()).toBe("2026-11-03T15:51:00.000Z");
    expect(parseBoughtDate("01/08/2026")?.toISOString()).toBe("2026-07-31T23:00:00.000Z");
    expect(parseBoughtDate(undefined)).toBeNull();
  });

  it("maps legacy statuses", () => {
    expect(mapStatus("ok")).toBe("ok");
    expect(mapStatus("sem stock")).toBe("out_of_stock");
    expect(mapStatus("não encontrado")).toBe("not_found");
    expect(mapStatus("sem preço no URL fixo")).toBe("not_found");
    expect(mapStatus("erro: HTTP 403")).toBe("blocked");
    expect(mapStatus("erro: render: net::ERR_NETWORK_CHANGED")).toBe("error");
    expect(mapStatus(undefined)).toBeNull();
  });

  it("infers categories from names", () => {
    expect(inferCategory("AMD Ryzen 7 9800X3D 4.7 GHz 8-Core Processor")).toBe("cpu");
    expect(inferCategory("Noctua NH-D15S chromax.black 82.51 CFM CPU Cooler")).toBe("cpu_cooler");
    expect(inferCategory("MSI MAG B850 TOMAHAWK MAX WIFI ATX AM5 Motherboard")).toBe("motherboard");
    expect(inferCategory("G.Skill Trident Z5 Neo 32 GB DDR5-6000 CL30 Memory")).toBe("memory");
    expect(inferCategory("Samsung 990 EVO Plus 2 TB NVME Solid State Drive")).toBe("storage");
    expect(inferCategory("MSI GeForce RTX 5070 Ti 16 GB Video Card")).toBe("gpu");
    expect(inferCategory("Fractal Design Pop XL Air ATX Full Tower Case")).toBe("case");
    expect(inferCategory("Fonte de Alimentação ATX Corsair HX1200i")).toBe("psu");
    expect(inferCategory("Something else")).toBeNull();
  });

  it("extracts ASINs from Amazon URLs", () => {
    expect(asinFromUrl("https://www.amazon.es/dp/B0DKFMSMYK")).toBe("B0DKFMSMYK");
    expect(asinFromUrl("https://www.amazon.fr/AMD-TM/dp/B0DKFMSMYK/ref=sr_1_1?x=1")).toBe(
      "B0DKFMSMYK",
    );
    expect(asinFromUrl("https://www.pcdiga.com/dp/B0DKFMSMYK")).toBeNull();
  });
});

describe("mapLegacy", () => {
  const plan = mapLegacy(fixture);
  const [cpu, psu] = plan.products;

  it("maps merchants with slug, country, base URL and flags", () => {
    expect(plan.merchants).toHaveLength(4);
    expect(plan.merchants[0]).toEqual({
      name: "Worten",
      slug: "worten",
      country: "PT",
      baseUrl: "https://www.worten.pt",
      searchTemplate: "https://www.worten.pt/search?query={q}&f.seller_id=Worten",
      currency: "EUR",
      shipping: 0,
      enabled: true,
      ownOnly: true,
      sortOrder: 0,
    });
    const uk = plan.merchants.find((m) => m.name === "Amazon.co.uk")!;
    expect(uk).toMatchObject({ currency: "GBP", enabled: false, ownOnly: false, country: "GB" });
    expect(plan.merchants.find((m) => m.name === "PCDiga")!.shipping).toBe(17);
  });

  it("maps product fields", () => {
    expect(cpu!.product).toEqual({
      name: "AMD Ryzen 7 9800X3D 4.7 GHz 8-Core Processor",
      category: "cpu",
      query: "AMD Ryzen 7 9800X3D",
      imageUrl: "https://example.com/9800x3d.jpg",
      refUrl: null,
      brand: "AMD",
      refPrice: 399.9,
    });
    expect(psu!.product).toMatchObject({ category: "psu", refPrice: null, imageUrl: null });
  });

  it("normalizes GTINs to 14 digits and records MPNs and ASINs", () => {
    expect(cpu!.identifiers).toEqual([
      { kind: "gtin", value: "05606628885125", source: "learned", merchant: null, confirmed: true },
      {
        kind: "mpn",
        value: "100-100001084WOF",
        source: "learned",
        merchant: null,
        confirmed: true,
      },
      { kind: "asin", value: "B0DKFMSMYK", source: "user", merchant: "Amazon.es", confirmed: true },
    ]);
    // UPC-12 → GTIN-14; typed fields are user-sourced.
    expect(psu!.identifiers.map((i) => [i.kind, i.value, i.source])).toEqual([
      ["gtin", "00840440495161", "user"],
      ["mpn", "CP-9020307-EU", "user"],
    ]);
  });

  it("maps manual/auto URLs and the last known state per merchant", () => {
    const pair = (m: string) => cpu!.pairs.find((p) => p.merchant === m)!;
    expect(cpu!.pairs).toHaveLength(4);
    expect(pair("PCDiga")).toMatchObject({
      manualUrl: "https://www.pcdiga.com/componentes/processadores/processador-amd-ryzen-7-9800x3d",
      autoUrl: null,
      lastStatus: "ok",
      lastPriceEur: 457,
    });
    expect(pair("PCDiga").lastCheckedAt?.toISOString()).toBe("2026-11-03T15:51:00.000Z");
    expect(pair("Amazon.co.uk")).toMatchObject({
      manualUrl: null,
      autoUrl: "https://www.amazon.co.uk/dp/B0DKFMSMYK",
    });
    expect(pair("Worten")).toMatchObject({ lastStatus: "not_found", lastPriceEur: null });
    expect(pair("Amazon.es")).toMatchObject({ lastStatus: "not_found" });

    const psuPair = (m: string) => psu!.pairs.find((p) => p.merchant === m)!;
    expect(psuPair("PCDiga")).toMatchObject({ lastStatus: "out_of_stock", lastPriceEur: 289.9 });
    expect(psuPair("Amazon.es")).toMatchObject({ lastStatus: "error", lastPriceEur: null });
  });

  it("imports the full history, including shipping and foreign currency", () => {
    expect(cpu!.pricePoints).toHaveLength(4);
    const uk = cpu!.pricePoints.find((p) => p.merchant === "Amazon.co.uk")!;
    expect(uk).toMatchObject({
      priceEur: 527.35,
      priceOrig: 440.76,
      currency: "GBP",
      shipping: null,
    });
    const pcdiga = cpu!.pricePoints.filter((p) => p.merchant === "PCDiga");
    expect(pcdiga.map((p) => p.shipping)).toEqual([null, 17]);
    expect(cpu!.pricePoints.find((p) => p.merchant === "Worten")!.url).toBeNull();
  });

  it("maps the blocklist", () => {
    expect(psu!.blocklist).toEqual([
      {
        merchant: "Worten",
        url: "https://www.worten.pt/produtos/fonte-de-alimentacao-corsair-hx750-7377192",
        name: "Fonte de Alimentação CORSAIR HX750",
      },
      {
        merchant: "Amazon.es",
        url: "https://www.amazon.es/dp/B0D5HY3F9X",
        name: "CORSAIR SF750 (2024)",
      },
    ]);
  });

  it("maps bought info onto the build item", () => {
    expect(cpu!.buildItem).toEqual({
      sortOrder: 0,
      boughtAt: null,
      boughtPrice: null,
      boughtMerchant: null,
    });
    expect(psu!.buildItem.sortOrder).toBe(1);
    expect(psu!.buildItem.boughtPrice).toBe(279.9);
    expect(psu!.buildItem.boughtMerchant).toBe("PCDiga");
    expect(psu!.buildItem.boughtAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("warns about bad data instead of failing", () => {
    const bad = mapLegacy({
      merchants: fixture.merchants,
      components: [
        {
          name: "Broken",
          ref: { gtin: "1234567890123" },
          history: { Ghost: [{ t: "2026-01-01T00:00", p: 1 }], PCDiga: [{ t: "nope", p: 1 }] },
        },
      ],
    });
    expect(bad.products[0]!.identifiers).toEqual([]);
    expect(bad.products[0]!.pricePoints).toEqual([]);
    expect(bad.products[0]!.product.query).toBe("Broken");
    expect(bad.warnings).toHaveLength(3);
  });
});

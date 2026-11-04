/**
 * The nine products imported from the legacy app, as MatchTargets, in the state the DB holds
 * after migration 0001 (learned GTIN/MPN codes unconfirmed at the default confidence 1; ASINs
 * from pinned URLs confirmed).
 */
import type { MatchTarget, Offer } from "../src/match/types";
import { canonicalUrl } from "../src/match/url";

export const cpu: MatchTarget = {
  name: "AMD Ryzen 7 9800X3D 4.7 GHz 8-Core Processor",
  query: "AMD Ryzen 7 9800X3D",
  brand: "AMD",
  category: "cpu",
  refPrice: 399.9,
  identifiers: [
    // Learned by the old app from PCBem's *tray* listing; wrong for the boxed CPU.
    { kind: "gtin", value: "05606628885125", source: "learned", confirmed: false, confidence: 1 },
    { kind: "mpn", value: "100-100001084WOF", source: "learned", confirmed: false, confidence: 1 },
    { kind: "asin", value: "B0DKFMSMYK", source: "user", confirmed: true },
  ],
  spec: { packaging: "box" },
};

export const cooler: MatchTarget = {
  name: "Noctua NH-D15S chromax.black 82.51 CFM CPU Cooler",
  query: "Noctua NH-D15S chromax.black",
  brand: "Noctua",
  category: "cooler",
  refPrice: 109.9,
  identifiers: [
    { kind: "gtin", value: "09010018000238", source: "learned", confirmed: false, confidence: 1 },
  ],
};

export const board: MatchTarget = {
  name: "MSI MAG B850 TOMAHAWK MAX WIFI ATX AM5 Motherboard",
  query: "MSI MAG B850 TOMAHAWK MAX WIFI",
  brand: "MSI",
  category: "motherboard",
  refPrice: 248.9,
  identifiers: [
    { kind: "mpn", value: "601-7E62-02S", source: "learned", confirmed: false, confidence: 1 },
  ],
};

export const ram: MatchTarget = {
  name: "G.Skill Trident Z5 Neo 32 GB (2 x 16 GB) DDR5-6000 CL30 Memory",
  query: "G.Skill Trident Z5 Neo 32GB DDR5-6000 CL30",
  brand: "G.SKILL",
  category: "ram",
  refPrice: 159.9,
  identifiers: [
    {
      kind: "mpn",
      value: "F5-6000J3038F16GX2-TZ5N",
      source: "learned",
      confirmed: false,
      confidence: 1,
    },
  ],
};

export const ssd: MatchTarget = {
  name: "Samsung 990 EVO Plus 2 TB M.2-2280 PCIe 5.0 X2 NVME Solid State Drive",
  query: "Samsung 990 EVO Plus 2TB",
  brand: "Samsung",
  category: "ssd",
  refPrice: 339.9,
  identifiers: [
    { kind: "mpn", value: "MZ-V9S2T0BW", source: "learned", confirmed: false, confidence: 1 },
  ],
};

export const gpu: MatchTarget = {
  name: "MSI GAMING TRIO OC PLUS GeForce RTX 5070 Ti 16 GB Video Card",
  query: "MSI GAMING TRIO OC PLUS GeForce RTX 5070 Ti",
  brand: "MSI",
  category: "gpu",
  refPrice: 1174.89,
  identifiers: [
    { kind: "gtin", value: "04711377301541", source: "learned", confirmed: false, confidence: 1 },
  ],
};

export const pcCase: MatchTarget = {
  name: "Fractal Design Pop XL Air ATX Full Tower Case",
  query: "Fractal Design Pop XL Air",
  brand: "Fractal Design",
  category: "case",
  refPrice: 119.9,
  identifiers: [],
};

export const psu: MatchTarget = {
  name: "be quiet! Straight Power 12 1000 W 80+ Platinum Certified Fully Modular ATX Power Supply",
  query: "be quiet! Straight Power 12 1000W",
  brand: "Be quiet!",
  category: "psu",
  refPrice: 278.9,
  identifiers: [
    { kind: "gtin", value: "04260052189436", source: "learned", confirmed: false, confidence: 1 },
  ],
};

export const corsair: MatchTarget = {
  name: "Fonte de Alimentação ATX Corsair HXi Series HX1200i (2025) 1200W ATX 3.1/PCIe 5.1 80 Plus Platinum Full Modular",
  query: "Fonte de Alimentação ATX Corsair HXi Series",
  brand: "Corsair",
  category: "psu",
  refPrice: 299.9,
  identifiers: [
    { kind: "gtin", value: "00840440495161", source: "user", confirmed: true },
    { kind: "mpn", value: "CP-9020307-EU", source: "user", confirmed: true },
  ],
  blocklist: [
    {
      url: "https://www.worten.pt/produtos/fonte-de-alimentacao-corsair-hx750-atx-750-w-80-plus-platinum-7377192",
      name: "Fonte de Alimentação CORSAIR HX750 (ATX - 750 W - 80 Plus Platinum)",
    },
  ],
};

/** A product-page offer with sensible defaults, for synthetic rule cases. */
export function offer(title: string, priceEur: number | null, extra: Partial<Offer> = {}): Offer {
  const url = extra.url ?? "https://shop.example/p/item";
  return {
    url,
    canonicalUrl: canonicalUrl(url),
    stage: "page",
    title,
    gtins: [],
    stock: "in_stock",
    categoryHints: [],
    pageKind: "product",
    ...(priceEur == null
      ? {}
      : {
          price: {
            value: priceEur,
            currency: "EUR",
            eur: priceEur,
            source: "test",
            raw: String(priceEur),
          },
        }),
    ...extra,
  };
}

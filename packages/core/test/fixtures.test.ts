/**
 * Regression fixtures: real pages saved on 2026-11-03 (trimmed by scripts/capture-fixture.ts),
 * covering the failures in the old app's diagnostico.txt. See docs/matching.md §9.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractProductPage } from "../src/extract/page";
import { extractSearchPage } from "../src/extract/search";
import { planIdentifierUpdates } from "../src/match/learn";
import { matchOffer, prefilterLinks } from "../src/match/score";
import type { MatchTarget } from "../src/match/types";
import { cpu } from "./products";

const fixture = (path: string) =>
  readFileSync(new URL(`./fixtures/${path}`, import.meta.url), "utf8");
const RATES = { GBP: 0.85 };

const page = (path: string, url: string) =>
  extractProductPage(fixture(path), url, { rates: RATES });
const search = (path: string, url: string) => extractSearchPage(fixture(path), url);

const GLOBALDATA =
  "https://www.globaldata.pt/processador-amd-ryzen-7-9800x3d-8-core-4.7ghz-5.25ghz-104mb-am5/100-100001084WOF.html";
const PCBEM_BOX =
  "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-c-turbo-5-2ghz-104mb/";
const PCBEM_TRAY =
  "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-ate-5-2ghz-104mb-tray/";

describe("Globaldata 9800X3D (old app: correct page rejected)", () => {
  const o = page("globaldata/9800x3d-product.html", GLOBALDATA);

  it("extracts title, price, codes and breadcrumbs from JSON-LD", () => {
    expect(o.title).toBe("Processador AMD Ryzen 7 9800X3D 8-Core (4.7GHz-5.25GHz) 104MB AM5");
    expect(o.titleSource).toBe("jsonld");
    // 456.90 is the offer price; 494.90 is the strikethrough price and must be ignored.
    expect(o.price).toMatchObject({ value: 456.9, currency: "EUR", eur: 456.9 });
    expect(o.gtins).toEqual(["00730143315289"]);
    expect(o.mpn).toBe("100-100001084WOF");
    expect(o.stock).toBe("in_stock");
    expect(o.categoryHints).toContain("Processadores AMD");
  });

  it("is accepted, and flags the wrong learned 560… GTIN as suspect", () => {
    const d = matchOffer(cpu, o);
    expect(d.decision).toBe("accept");
    expect(d.vetoes).toEqual([]);
    expect(d.suspectIdentifiers).toEqual(["05606628885125"]);
  });

  it("halves the wrong learned code's confidence and learns the real one", () => {
    const d = matchOffer(cpu, o);
    const updates = planIdentifierUpdates({
      existing: cpu.identifiers.map((i) => ({ ...i, sightings: [] })),
      offer: o,
      decision: d,
      merchantId: "globaldata",
      now: 0,
    });
    expect(updates).toContainEqual({
      op: "update",
      kind: "gtin",
      value: "05606628885125",
      confidence: 0.5,
    });
    expect(updates).toContainEqual(
      expect.objectContaining({ op: "insert", kind: "gtin", value: "00730143315289" }),
    );
  });
});

describe("Globaldata search page", () => {
  const s = search(
    "globaldata/9800x3d-search.html",
    "https://www.globaldata.pt/search?q=AMD+Ryzen+7+9800X3D&search-button=&lang=pt_PT",
  );
  const { kept, dropped } = prefilterLinks(cpu, s.links);

  it("keeps the CPU link", () => {
    expect(kept.map((k) => k.url)).toEqual([GLOBALDATA]);
  });

  it("drops the King Mod PCs and the bundle by A5, the facet links by A8", () => {
    const kingMod = dropped.filter((d) => d.url.includes("computador-king-mod"));
    expect(kingMod.length).toBeGreaterThanOrEqual(3);
    expect(new Set(kingMod.map((d) => d.rule))).toEqual(new Set(["A9:A5-prebuilt"]));
    expect(dropped.find((d) => d.url.includes("bundle-processador-9800x3d"))?.rule).toBe(
      "A9:A5-prebuilt",
    );
    expect(dropped.find((d) => d.url.includes("/computadores?q="))?.rule).toBe("A8-not-product");
  });
});

describe("PCBem search page (JS-rendered; saved from the browser runner)", () => {
  const s = search(
    "pcbem/9800x3d-search.html",
    "https://www.pcbem.pt/?s=AMD+Ryzen+7+9800X3D&post_type=product",
  );
  const { kept, dropped } = prefilterLinks(cpu, s.links);

  it("keeps only the boxed CPU", () => {
    expect(kept.map((k) => k.url)).toEqual([PCBEM_BOX]);
  });

  it("drops the tray by B4, the prebuilt PC by A5 and the home link by A11", () => {
    const rule = (url: string) => dropped.find((d) => d.url === url)?.rule;
    expect(rule(PCBEM_TRAY)).toBe("A9:B4-packaging");
    expect(
      rule("https://www.pcbem.pt/loja/computador-r7-9800x3d-rtx-5070-1tb-32gb-powered-by-asus/"),
    ).toBe("A9:A5-prebuilt");
    expect(rule("https://www.pcbem.pt/")).toBe("A11-junk-link");
  });
});

describe("PCBem 9800X3D (old app: correct page rejected)", () => {
  const box = page("pcbem/9800x3d-box.html", PCBEM_BOX);
  const tray = page("pcbem/9800x3d-tray.html", PCBEM_TRAY);

  it("reads the title from JSON-LD, not the 'Grátis' h1", () => {
    expect(box.title).toBe("AMD AM5 Ryzen 7 9800X3D 8-Core 4.7GHz c/ Turbo 5.2GHz 104MB");
    expect(box.price?.eur).toBe(499.9);
    expect(box.seller).toMatchObject({ name: "PCBEM", own: true });
  });

  it("accepts the boxed CPU (MPN in the SKU)", () => {
    expect(matchOffer(cpu, box).decision).toBe("accept");
  });

  it("rejects the tray CPU under B4 when the product is boxed", () => {
    const d = matchOffer(cpu, tray);
    expect(d.decision).toBe("reject");
    expect(d.vetoes).toEqual(["B4-packaging"]);
  });

  it("accepts the tray CPU when any packaging is fine", () => {
    const anyPackaging: MatchTarget = { ...cpu, spec: { packaging: "any" } };
    expect(matchOffer(anyPackaging, tray).decision).toBe("accept");
  });

  it("the tray page carries the 560… code the old app learned", () => {
    expect(tray.gtins).toEqual(["05606628885125"]);
  });
});

describe("Amazon.es 9800X3D (old app: title read from the summary block)", () => {
  const o = page(
    "amazon-es/9800x3d-product.html",
    "https://www.amazon.es/-/pt/dp/B0DKFMSMYK/ref=sr_1_1",
  );

  it("reads #productTitle, not the 'O resumo do produto' h1", () => {
    expect(o.title).toBe("Processore Amd, Ryzen 7 9800x3d, 4,7 gz, 8 núcleo, 104 Mb L2 E L3, Am5");
    expect(o.titleSource).toBe("selector");
    expect(o.price).toMatchObject({ value: 416.72, currency: "EUR" });
    expect(o.asin).toBe("B0DKFMSMYK");
    expect(o.canonicalUrl).toBe("https://www.amazon.es/dp/B0DKFMSMYK");
  });

  it("is sold by Amazon and accepted for an own-only merchant", () => {
    expect(o.seller).toMatchObject({ name: "Amazon", own: true });
    expect(matchOffer(cpu, o, { ownOnly: true }).decision).toBe("accept");
  });
});

describe("Amazon.es search page", () => {
  const s = search(
    "amazon-es/9800x3d-search.html",
    "https://www.amazon.es/s?k=AMD+Ryzen+7+9800X3D",
  );
  const { kept, dropped } = prefilterLinks(cpu, s.links);

  it("keeps only the boxed 9800X3D", () => {
    expect(kept.map((k) => k.url.match(/dp\/(\w+)/)?.[1])).toEqual(["B0DKFMSMYK"]);
  });

  it("drops the 'sem caixa' listing by B4 and the 9850X3D by A10", () => {
    expect(dropped.find((d) => d.url.includes("B0DQ86KCP2"))?.rule).toBe("A9:B4-packaging");
    expect(dropped.find((d) => d.url.includes("B0G8JMLXNQ"))?.rule).toBe("A10-link-score");
  });
});

describe("Amazon.co.uk 9800X3D", () => {
  const o = page("amazon-uk/9800x3d-product.html", "https://www.amazon.co.uk/dp/B0DKFMSMYK");

  it("matches the spaced '9800X 3D' title", () => {
    const d = matchOffer(cpu, o, { ownOnly: true, country: "GB" });
    expect(d.similarity).toBe(1);
    expect(d.decision).toBe("accept");
  });

  it("reads 'EUR440.76' as EUR", () => {
    expect(o.price).toMatchObject({ value: 440.76, currency: "EUR", eur: 440.76 });
  });
});

describe("Radio Popular search (old app: 'missed')", () => {
  const s = search(
    "radiopopular/9800x3d-search.html",
    "https://www.radiopopular.pt/pesquisa/AMD%20Ryzen%207%209800X3D",
  );

  it("parses the 12 result cards, none of which is the CPU, so nothing is kept", () => {
    const products = s.links.filter((l) => l.url.includes("/produto/"));
    expect(products.length).toBeGreaterThanOrEqual(12);
    expect(prefilterLinks(cpu, s.links).kept).toEqual([]);
  });
});

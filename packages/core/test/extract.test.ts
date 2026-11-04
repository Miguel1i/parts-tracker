import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractProductPage, isPlausibleTitle } from "../src/extract/page";
import { detectCurrency, readPrice } from "../src/extract/price";
import { extractSearchPage } from "../src/extract/search";
import { stockFromAvailability, stockFromText } from "../src/extract/stock";
import { matchOffer } from "../src/match/score";
import { cpu } from "./products";

const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("B13 price sanity", () => {
  it("reads European and English formats with their currency", () => {
    expect(readPrice({ raw: "1.234,56 €", source: "s", structured: false }, "EUR")).toMatchObject({
      price: { value: 1234.56, currency: "EUR" },
    });
    expect(detectCurrency("EUR440.76")).toBe("EUR");
    expect(detectCurrency("£399.99")).toBe("GBP");
    expect(detectCurrency("399,90")).toBeNull();
  });
  it("discards instalments, 'from' prices and text prices without a currency", () => {
    expect(
      readPrice(
        { raw: "41,66 €", context: "12x de 41,66 €", source: "s", structured: false },
        "EUR",
      ),
    ).toHaveProperty("reason");
    expect(readPrice({ raw: "33 €/mês", source: "s", structured: false }, "EUR")).toHaveProperty(
      "reason",
    );
    expect(
      readPrice({ raw: "399 €", context: "desde 399 €", source: "s", structured: false }, "EUR"),
    ).toHaveProperty("reason");
    expect(readPrice({ raw: "399,90", source: "s", structured: false }, "EUR")).toHaveProperty(
      "reason",
    );
  });
  it("converts with ECB-style rates and refuses a currency without one", () => {
    expect(
      readPrice({ raw: "374.65", currency: "GBP", source: "jsonld", structured: true }, "EUR", {
        GBP: 0.85,
      }),
    ).toMatchObject({
      price: { value: 374.65, currency: "GBP", eur: 440.76 },
    });
    expect(
      readPrice({ raw: "374.65", currency: "GBP", source: "jsonld", structured: true }, "EUR"),
    ).toHaveProperty("reason");
  });
});

describe("B12 stock", () => {
  it("maps schema.org availability and shop words", () => {
    expect(stockFromAvailability("https://schema.org/InStock")).toBe("in_stock");
    expect(stockFromAvailability("http://schema.org/PreOrder")).toBe("preorder");
    expect(stockFromAvailability("OutOfStock")).toBe("out_of_stock");
    expect(stockFromText("Esgotado")).toBe("out_of_stock");
    expect(stockFromText("Pré-venda: disponível a 20/11")).toBe("preorder");
    expect(stockFromText("Em stock")).toBe("in_stock");
  });
  it("a preorder title wins over InStock", () => {
    const html = ld({
      "@type": "Product",
      name: "AMD Ryzen 7 9850X3D (Pré-venda)",
      offers: {
        "@type": "Offer",
        price: "499.90",
        priceCurrency: "EUR",
        availability: "https://schema.org/InStock",
      },
    });
    expect(extractProductPage(html, "https://s.pt/p/1").stock).toBe("preorder");
  });
});

describe("title extraction", () => {
  it("rejects boilerplate titles", () => {
    expect(isPlausibleTitle("Grátis")).toBe(false);
    expect(isPlausibleTitle("O resumo do produto apresenta informações essenciais")).toBe(false);
    expect(isPlausibleTitle("Resultados da pesquisa")).toBe(false);
    expect(isPlausibleTitle("AMD Ryzen 7 9800X3D")).toBe(true);
  });
  it("falls back from h1 to the document title without the shop suffix", () => {
    const html = `<html><head><title>MSI MAG B850 TOMAHAWK MAX WIFI | PCDiga</title></head><body><h1>Grátis</h1></body></html>`;
    expect(extractProductPage(html, "https://www.pcdiga.com/p/1").title).toBe(
      "MSI MAG B850 TOMAHAWK MAX WIFI",
    );
  });
  it("ignores AggregateOffer 'from' prices of several sellers", () => {
    const html = ld({
      "@type": "Product",
      name: "AMD Ryzen 7 9800X3D",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "399",
        highPrice: "520",
        offerCount: 6,
        priceCurrency: "EUR",
      },
    });
    const o = extractProductPage(html, "https://s.pt/p/1");
    expect(o.price).toBeUndefined();
    expect(matchOffer(cpu, o).noPrice).toBe(true);
  });
});

describe("A13 seller detection", () => {
  // Real page saved on 2026-11-03 by the milestone 4 browser runner (Worten blocks plain
  // fetches): the 9800X3D offer from the marketplace seller ON4TECH.
  const WORTEN_ON4TECH =
    "https://www.worten.pt/produtos/processador-ryzen-7-9800x3d-4-7-ghz-96-mb-l3-1400374-amd-mrkean-8435280949534";
  const on4tech = readFileSync(
    new URL("./fixtures/worten/9800x3d-on4tech.html", import.meta.url),
    "utf8",
  );
  const worten = `<html><body>
    ${ld({ "@type": "Product", name: "Processador Amd Ryzen 7 9800x3d 4,7 Ghz 8 Núcleos 120w", offers: { "@type": "Offer", price: 442, priceCurrency: "EUR" } })}
    <div class="seller-info">Vendido por <a class="marketplace-seller" href="/marketplace/on4tech">ON4TECH</a></div>
  </body></html>`;

  it("finds the Worten marketplace seller on the real page and rejects it for an own-only shop", () => {
    const o = extractProductPage(on4tech, WORTEN_ON4TECH);
    expect(o.title).toBe("Processador Ryzen 7 9800x3d 4,7 GHz 96 MB L3 1400374 AMD");
    expect(o.price).toMatchObject({ value: 492, currency: "EUR" });
    expect(o.seller).toMatchObject({ own: false, name: "ON4TECH" });
    const d = matchOffer(cpu, o, { ownOnly: true });
    expect(d.decision).toBe("reject");
    expect(d.vetoes).toEqual(["A13-seller"]);
    expect(d.results.find((r) => r.rule === "A13-seller")?.evidence).toBe("sold by ON4TECH");
    // At a shop that allows marketplace offers the same page is not vetoed.
    expect(matchOffer(cpu, o, { ownOnly: false }).vetoes).toEqual([]);
  });

  it("recognises the shop selling its own offer", () => {
    const html = worten.replace(
      /<div class="seller-info">.*<\/div>/,
      "<div>Vendido por Worten</div>",
    );
    expect(extractProductPage(html, "https://www.worten.pt/produtos/x").seller).toMatchObject({
      own: true,
    });
  });

  it("reports unknown when the page says nothing", () => {
    const html = ld({
      "@type": "Product",
      name: "AMD Ryzen 7 9800X3D",
      offers: { price: 400, priceCurrency: "EUR" },
    });
    expect(extractProductPage(html, "https://www.globaldata.pt/p").seller?.own).toBe("unknown");
  });
});

describe("search page links", () => {
  it("merges image and text links and keeps card text", () => {
    const html = `<ul><li class="product"><a href="/p/9800x3d"><img alt="AMD Ryzen 7 9800X3D"></a>
      <a href="/p/9800x3d">Processador AMD Ryzen 7 9800X3D</a><span>456,90 €</span></li></ul>`;
    const s = extractSearchPage(html, "https://s.pt/search?q=9800x3d");
    const link = s.links.find((l) => l.url === "https://s.pt/p/9800x3d");
    expect(link?.text).toContain("Processador AMD Ryzen 7 9800X3D");
    expect(link?.context).toContain("456,90");
  });
  it("reads listing offers from embedded app-state JSON", () => {
    const state = {
      props: {
        items: [{ name: "Processador AMD Ryzen 7 9800X3D", price: 442, url: "/produtos/9800x3d" }],
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`;
    const s = extractSearchPage(html, "https://www.worten.pt/search?query=9800x3d");
    expect(s.offers).toEqual([
      expect.objectContaining({
        stage: "listing",
        title: "Processador AMD Ryzen 7 9800X3D",
        url: "https://www.worten.pt/produtos/9800x3d",
      }),
    ]);
  });
});

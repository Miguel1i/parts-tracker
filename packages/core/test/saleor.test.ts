import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchOffer,
  saleorOffer,
  saleorProductBody,
  saleorProductNode,
  saleorSearchBody,
  saleorSearchNodes,
  saleorSlugFromUrl,
} from "../src";
import { cpu } from "./products";

const SITE = "https://www.pcdiga.com";
const cfg = {
  endpoint: "https://pcdiga-prod.eu.saleor.cloud/graphql/",
  channel: "default-channel",
};
const search = JSON.parse(
  readFileSync(new URL("./fixtures/saleor-pcdiga-search.json", import.meta.url), "utf-8"),
);

describe("saleor storefront offers", () => {
  const nodes = saleorSearchNodes(search)!;
  const [ryzen, desktop] = nodes.map((n) => saleorOffer(n, SITE));

  it("reads a search response", () => {
    expect(nodes).toHaveLength(3);
    expect(saleorSearchNodes({ errors: [{ message: "x" }] })).toBeNull();
  });

  it("builds the shop's product URL from the category path and slug", () => {
    expect(ryzen!.url).toBe(
      "https://www.pcdiga.com/componentes/processadores/processadores-amd/processador-amd-ryzen-7-9800x3d-zen-5-8-core-4-7ghz-c-turbo-5-2ghz-104mb-cache-sktam5-100-100001084wof-730143315289",
    );
  });

  it("carries price, stock, identifiers and image", () => {
    expect(ryzen!.price?.eur).toBeGreaterThan(100);
    expect(ryzen!.price?.source).toBe("api");
    expect(["in_stock", "out_of_stock"]).toContain(ryzen!.stock);
    expect(ryzen!.mpn).toBe("100-100001084WOF");
    expect(ryzen!.gtins).toContain("00730143315289");
    expect(ryzen!.brand).toBe("AMD");
    expect(ryzen!.image).toMatch(/^https:\/\//);
    expect(ryzen!.seller?.own).toBe(true);
  });

  it("scores like a product page: the CPU matches, a prebuilt desktop doesn't", () => {
    expect(matchOffer(cpu, ryzen!).decision).toBe("accept");
    expect(matchOffer(cpu, desktop!).decision).not.toBe("accept");
  });

  it("only prices EUR channels", () => {
    const usd = saleorOffer(
      {
        name: "X",
        slug: "x",
        pricing: { priceRange: { start: { gross: { amount: 5, currency: "USD" } } } },
      },
      SITE,
    );
    expect(usd.price).toBeUndefined();
  });

  it("derives stock from availability and quantities", () => {
    const base = { name: "X", slug: "x" };
    expect(saleorOffer({ ...base, isAvailableForPurchase: false }, SITE).stock).toBe(
      "out_of_stock",
    );
    expect(
      saleorOffer(
        { ...base, isAvailableForPurchase: true, variants: [{ quantityAvailable: 0 }] },
        SITE,
      ).stock,
    ).toBe("out_of_stock");
    expect(saleorOffer({ ...base, isAvailableForPurchase: true }, SITE).stock).toBe("in_stock");
  });

  it("builds requests and reads the slug of a product URL", () => {
    expect(saleorSearchBody(cfg, "9800X3D").variables).toMatchObject({
      q: "9800X3D",
      c: "default-channel",
    });
    expect(saleorProductBody(cfg, "abc").variables).toMatchObject({ s: "abc" });
    expect(saleorSlugFromUrl(`${SITE}/componentes/processadores/abc-123`)).toBe("abc-123");
    expect(saleorSlugFromUrl("not a url")).toBeNull();
    expect(saleorProductNode({ data: { product: null } })).toBeNull();
    expect(saleorProductNode({})).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { cpu } from "../../core/test/products";
import { scrapePair, type PairInput } from "../src/pair";
import {
  amazonEs,
  fixture,
  FakeFetcher,
  globaldata,
  GLOBALDATA_PAGE,
  globaldataRoutes,
  pcbem,
  PCBEM_BOX,
  PCBEM_TRAY,
} from "./helpers";

const now = () => 1_800_000_000_000;
const input = (over: Partial<PairInput> = {}): PairInput => ({
  productId: "p-cpu",
  productName: cpu.name,
  merchant: globaldata,
  state: null,
  target: cpu,
  rates: { GBP: 0.85 },
  ...over,
});
const EMPTY_SEARCH = { html: "<html><body><p>Sem resultados</p></body></html>" };

describe("search (GTIN → MPN → text)", () => {
  it("accepts the Globaldata page and stops at the first accepting query", async () => {
    const f = new FakeFetcher(globaldataRoutes);
    const o = await scrapePair(input(), f, { now });
    expect(o.status).toBe("ok");
    expect(o.accepted?.offer.price?.eur).toBe(456.9);
    expect(o.accepted?.via).toBe("search");
    expect(o.autoUrl).toEqual({ url: GLOBALDATA_PAGE, failures: 0 });
    // GTIN search found and accepted the page: no MPN or text search.
    const searches = f.calls.filter((c) => c.url.includes("/search?"));
    expect(searches).toHaveLength(1);
    expect(searches[0]!.url).toContain("q=5606628885125");
    expect(o.trace.join("\n")).toMatch(/accept/);
  });

  it("is not_found when no query finds the product", async () => {
    const f = new FakeFetcher({ "https://www.globaldata.pt/search": EMPTY_SEARCH });
    const o = await scrapePair(input(), f, { now });
    expect(o.status).toBe("not_found");
    expect(f.calls).toHaveLength(3); // GTIN, MPN, text
    expect(o.accepted).toBeUndefined();
  });

  it("follows a search that redirects straight to the product page", async () => {
    const f = new FakeFetcher({
      "https://www.globaldata.pt/search": {
        html: fixture("globaldata/9800x3d-product.html"),
        finalUrl: GLOBALDATA_PAGE,
      },
    });
    const o = await scrapePair(input(), f, { now });
    expect(o.status).toBe("ok");
    expect(f.calls).toHaveLength(1);
  });

  it("retries a JS-rendered search page in the browser and remembers it for the run", async () => {
    const f = new FakeFetcher(
      {
        "https://www.globaldata.pt/search": EMPTY_SEARCH,
        [GLOBALDATA_PAGE]: globaldataRoutes[GLOBALDATA_PAGE]!,
      },
      globaldataRoutes,
    );
    const memo = { jsSearch: new Set<string>() };
    const o = await scrapePair(input(), f, { now, memo });
    expect(o.status).toBe("ok");
    // GTIN and MPN come back empty in plain HTML (normal); the text query probes the browser.
    expect(f.calls.map((c) => c.browser)).toEqual([false, false, false, true, false]);
    expect(memo.jsSearch.has(globaldata.id)).toBe(true);
  });
});

describe("pinned URL (A16)", () => {
  it("uses the pinned page even when the rules reject it, and records the warning", async () => {
    const f = new FakeFetcher({ [PCBEM_TRAY]: { html: fixture("pcbem/9800x3d-tray.html") } });
    const o = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: PCBEM_TRAY, autoUrl: null, autoUrlFailures: 0 },
      }),
      f,
      { now },
    );
    expect(o.status).toBe("ok");
    expect(o.accepted?.via).toBe("manual");
    expect(o.accepted?.decision.warning).toBe(true);
    expect(o.lastMatch).toMatchObject({ decision: "reject" });
    expect(o.lastMatch?.vetoes).toContain("B4-packaging");
    expect(f.calls).toHaveLength(1); // never searches past a pinned URL
  });

  it("reports blocked when the pinned page is blocked", async () => {
    const f = new FakeFetcher({ [PCBEM_TRAY]: { status: 403 } });
    const o = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: PCBEM_TRAY, autoUrl: null, autoUrlFailures: 0 },
      }),
      f,
      { now },
    );
    expect(o.status).toBe("blocked");
    expect(o.failurePages).toHaveLength(1);
  });

  it("keeps a pinned page without a price for the debug artifact", async () => {
    const html = "<html><head><title>AMD Ryzen 7 9800X3D</title></head><body></body></html>";
    const f = new FakeFetcher({ [PCBEM_TRAY]: { html } });
    const o = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: PCBEM_TRAY, autoUrl: null, autoUrlFailures: 0 },
      }),
      f,
      { now },
    );
    expect(o.status).toBe("not_found");
    expect(o.failurePages).toEqual([{ url: PCBEM_TRAY, status: 200, reason: "no price", html }]);
  });
});

describe("auto URL revalidation (A15)", () => {
  const search = "https://www.pcbem.pt/?s=";

  it("keeps an auto URL that still matches, without searching", async () => {
    const f = new FakeFetcher({ [PCBEM_BOX]: { html: fixture("pcbem/9800x3d-box.html") } });
    const o = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: null, autoUrl: PCBEM_BOX, autoUrlFailures: 2 },
      }),
      f,
      { now },
    );
    expect(o.status).toBe("ok");
    expect(o.accepted?.offer.price?.eur).toBe(499.9);
    expect(o.autoUrl).toEqual({ url: PCBEM_BOX, failures: 0 });
    expect(f.calls).toHaveLength(1);
  });

  it("counts a failure, then drops the URL on the third", async () => {
    const routes = {
      [PCBEM_TRAY]: { html: fixture("pcbem/9800x3d-tray.html") },
      [search]: EMPTY_SEARCH,
    };
    const first = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: null, autoUrl: PCBEM_TRAY, autoUrlFailures: 0 },
      }),
      new FakeFetcher(routes),
      { now },
    );
    expect(first.status).toBe("not_found");
    expect(first.autoUrl).toEqual({ url: PCBEM_TRAY, failures: 1 });

    const third = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: null, autoUrl: PCBEM_TRAY, autoUrlFailures: 2 },
      }),
      new FakeFetcher(routes),
      { now },
    );
    expect(third.autoUrl).toEqual({ url: null, failures: 0 });
  });

  it("does not count a blocked auto URL as a failure", async () => {
    const f = new FakeFetcher({ [PCBEM_TRAY]: { status: 429 }, [search]: { status: 429 } });
    const o = await scrapePair(
      input({
        merchant: pcbem,
        state: { manualUrl: null, autoUrl: PCBEM_TRAY, autoUrlFailures: 1 },
      }),
      f,
      { now },
    );
    expect(o.status).toBe("blocked");
    expect(o.autoUrl).toBeUndefined();
    // The search wall stops the remaining queries.
    expect(f.calls.filter((c) => c.url.startsWith(search))).toHaveLength(1);
  });
});

describe("Amazon ASIN reuse", () => {
  it("tries /dp/<ASIN> before searching", async () => {
    const f = new FakeFetcher({
      "https://www.amazon.es/dp/B0DKFMSMYK": { html: fixture("amazon-es/9800x3d-product.html") },
    });
    const o = await scrapePair(input({ merchant: amazonEs, asin: "B0DKFMSMYK" }), f, { now });
    expect(o.status).toBe("ok");
    expect(o.accepted?.via).toBe("asin");
    expect(o.accepted?.offer.price?.eur).toBe(416.72);
    expect(f.calls).toHaveLength(1);
  });
});

describe("blocked part-way", () => {
  it("reports blocked, not not_found, when the product page is walled", async () => {
    const f = new FakeFetcher({
      "https://www.globaldata.pt/search": globaldataRoutes["https://www.globaldata.pt/search"]!,
      [GLOBALDATA_PAGE]: { status: 403, html: "<title>Just a moment...</title>" },
    });
    const o = await scrapePair(input(), f, { now });
    expect(o.status).toBe("blocked");
    expect(o.message).toMatch(/part-way \(cloudflare\)/);
  });
});

describe("review", () => {
  it("returns the best review candidate when nothing is accepted", async () => {
    // Without the MPN and with a query word the page lacks, the title alone isn't enough.
    const target = {
      ...cpu,
      name: "AMD Ryzen 7 9800X3D Gaming Edition",
      query: "AMD Ryzen 7 9800X3D Edition",
      identifiers: [],
    };
    const f = new FakeFetcher(globaldataRoutes);
    const o = await scrapePair(input({ target }), f, { now });
    expect(o.status).toBe("not_found");
    expect(o.review?.decision.decision).toBe("review");
    expect(o.message).toMatch(/review candidate/);
    expect(o.lastMatch?.decision).toBe("review");
  });
});

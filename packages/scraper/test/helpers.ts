import { readFileSync } from "node:fs";
import type { FetchOptions, FetchResult, PageFetcher } from "../src/http";
import { blockReason } from "../src/http";
import type { PairMerchant } from "../src/pair";

/** Real trimmed pages from @parts/core's fixtures. */
export const fixture = (path: string) =>
  readFileSync(new URL(`../../core/test/fixtures/${path}`, import.meta.url), "utf8");

export type Route = { status?: number; html?: string; finalUrl?: string; error?: string };

/**
 * A PageFetcher over routing tables. Routes match by exact URL, then by longest prefix.
 * `browserRoutes` answer `{ browser: true }` requests (when set, hasBrowser is true).
 */
export class FakeFetcher implements PageFetcher {
  calls: { url: string; browser: boolean }[] = [];
  constructor(
    private routes: Record<string, Route>,
    private browserRoutes?: Record<string, Route>,
  ) {}
  get hasBrowser() {
    return !!this.browserRoutes;
  }
  private find(table: Record<string, Route>, url: string): Route {
    if (table[url]) return table[url]!;
    const prefix = Object.keys(table)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    return prefix ? table[prefix]! : { status: 404, html: "<html><title>404</title></html>" };
  }
  async get(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const browser = !!options.browser && this.hasBrowser;
    this.calls.push({ url, browser });
    const r = this.find(browser ? this.browserRoutes! : this.routes, url);
    const status = r.error ? 0 : (r.status ?? 200);
    const html = r.html ?? "";
    const blocked = status ? blockReason(status, html) : null;
    return {
      url,
      finalUrl: r.finalUrl ?? url,
      status,
      html,
      via: browser ? "browser" : "fetch",
      ...(blocked ? { blocked } : {}),
      ...(r.error ? { error: r.error } : {}),
      attempts: 1,
      ms: 5,
    };
  }
}

export const GLOBALDATA_PAGE =
  "https://www.globaldata.pt/processador-amd-ryzen-7-9800x3d-8-core-4.7ghz-5.25ghz-104mb-am5/100-100001084WOF.html";
export const PCBEM_TRAY =
  "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-ate-5-2ghz-104mb-tray/";
export const PCBEM_BOX =
  "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-c-turbo-5-2ghz-104mb/";

export const globaldata: PairMerchant = {
  id: "m-globaldata",
  name: "Globaldata",
  baseUrl: "https://www.globaldata.pt",
  searchTemplate: "https://www.globaldata.pt/search?q={q}&search-button=&lang=pt_PT",
  currency: "EUR",
  country: "PT",
  ownOnly: false,
  needsBrowser: false,
  adapterConfig: {},
};

export const pcbem: PairMerchant = {
  ...globaldata,
  id: "m-pcbem",
  name: "PCBem",
  baseUrl: "https://www.pcbem.pt",
  searchTemplate: "https://www.pcbem.pt/?s={q}&post_type=product",
};

export const amazonEs: PairMerchant = {
  ...globaldata,
  id: "m-amazon-es",
  name: "Amazon.es",
  baseUrl: "https://www.amazon.es",
  searchTemplate: "https://www.amazon.es/s?k={q}",
  country: "ES",
};

export const globaldataRoutes: Record<string, Route> = {
  "https://www.globaldata.pt/search": { html: fixture("globaldata/9800x3d-search.html") },
  [GLOBALDATA_PAGE]: { html: fixture("globaldata/9800x3d-product.html") },
};

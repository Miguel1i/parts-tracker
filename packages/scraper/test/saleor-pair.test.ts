import { describe, expect, it } from "vitest";
import { cpu } from "../../core/test/products";
import type { JsonResult } from "../src/http";
import { saleorConfig, scrapePair, type PairInput, type PairMerchant } from "../src/pair";
import { fixture, FakeFetcher, globaldata } from "./helpers";

const ENDPOINT = "https://pcdiga-prod.eu.saleor.cloud/graphql/";
const SEARCH = JSON.parse(fixture("saleor-pcdiga-search.json"));
const RYZEN = SEARCH.data.products.edges[0].node;

const pcdiga: PairMerchant = {
  ...globaldata,
  id: "m-pcdiga",
  name: "PCDiga",
  baseUrl: "https://www.pcdiga.com",
  searchTemplate: "https://www.pcdiga.com/search?query={q}",
  adapterConfig: { saleor: { endpoint: ENDPOINT, channel: "default-channel" } },
};

/** HTML is a Cloudflare wall; the storefront API answers from `api`. */
class ApiFetcher extends FakeFetcher {
  posts: { url: string; body: { variables: Record<string, unknown> } }[] = [];
  constructor(
    private api: (body: { query: string; variables: Record<string, unknown> }) => unknown,
  ) {
    super({ "https://www.pcdiga.com": { status: 403, html: "<title>Just a moment...</title>" } });
  }
  async postJson(url: string, body: unknown): Promise<JsonResult> {
    const b = body as { query: string; variables: Record<string, unknown> };
    this.posts.push({ url, body: b });
    const json = this.api(b);
    return json === 500
      ? { status: 500, attempts: 1, ms: 5 }
      : { status: 200, json, attempts: 1, ms: 5 };
  }
}

const input = (over: Partial<PairInput> = {}): PairInput => ({
  productId: "p-cpu",
  productName: cpu.name,
  merchant: pcdiga,
  state: null,
  target: cpu,
  rates: {},
  ...over,
});
const now = () => 1_800_000_000_000;

describe("Saleor storefront API merchants", () => {
  it("searches the API instead of the blocked HTML and accepts the matching product", async () => {
    const f = new ApiFetcher(() => SEARCH);
    const out = await scrapePair(input(), f, { now });
    expect(out.status === "ok" || out.status === "out_of_stock").toBe(true);
    expect(out.accepted?.offer.url).toMatch(
      /^https:\/\/www\.pcdiga\.com\/componentes\/processadores\//,
    );
    expect(out.autoUrl?.url).toBe(out.accepted?.offer.canonicalUrl);
    expect(f.calls).toHaveLength(0); // no HTML page was requested
    expect(f.posts[0]!.url).toBe(ENDPOINT);
  });

  it("revalidates the auto URL by its slug", async () => {
    const f = new ApiFetcher((b) => (b.variables.s ? { data: { product: RYZEN } } : SEARCH));
    const url = `https://www.pcdiga.com/componentes/processadores/processadores-amd/${RYZEN.slug}`;
    const out = await scrapePair(
      input({ state: { manualUrl: null, autoUrl: url, autoUrlFailures: 0 } }),
      f,
      { now },
    );
    expect(out.accepted?.via).toBe("auto");
    expect(f.posts).toHaveLength(1);
    expect(f.posts[0]!.body.variables.s).toBe(RYZEN.slug);
  });

  it("reports an API failure as an error, not a block", async () => {
    const out = await scrapePair(input(), new ApiFetcher(() => 500), { now });
    expect(out.status).toBe("error");
  });

  it("reads only well-formed adapter config", () => {
    expect(saleorConfig({ saleor: { endpoint: ENDPOINT, channel: "default-channel" } })).toEqual({
      endpoint: ENDPOINT,
      channel: "default-channel",
    });
    expect(saleorConfig({ saleor: { endpoint: "http://x", channel: "c" } })).toBeNull();
    expect(saleorConfig({})).toBeNull();
  });
});

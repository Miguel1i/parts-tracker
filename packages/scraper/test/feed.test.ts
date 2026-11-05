import { gzipSync } from "node:zlib";
import { FeedIndex, feedOffers } from "@parts/core";
import { describe, expect, it } from "vitest";
import { cooler, cpu } from "../../core/test/products";
import { decodeFeed, feedUrlFor, redactFeedUrl } from "../src/feed";
import { scrapePair, type PairInput, type PairMerchant } from "../src/pair";
import { fixture, FakeFetcher, globaldata } from "./helpers";

const FEED = new FeedIndex(feedOffers(fixture("feeds/awin-sample.csv")));
const pcc: PairMerchant = {
  ...globaldata,
  id: "m-pcc",
  name: "PCComponentes PT",
  baseUrl: "https://www.pccomponentes.pt",
  searchTemplate: "https://www.pccomponentes.pt/search/?query={q}",
};
const input = (over: Partial<PairInput> = {}): PairInput => ({
  productId: "p-cpu",
  productName: cpu.name,
  merchant: pcc,
  state: null,
  target: cpu,
  rates: {},
  feed: FEED,
  ...over,
});
const now = () => 1_800_000_000_000;
/** Every page is a Cloudflare wall: a feed pair must never fetch. */
const walled = () =>
  new FakeFetcher({ "https://": { status: 403, html: "<title>Just a moment...</title>" } });

describe("affiliate feed pairs", () => {
  it("accepts the feed product by identifiers without fetching any page", async () => {
    const f = walled();
    const out = await scrapePair(input(), f, { now });
    expect(out.status).toBe("ok");
    expect(out.accepted?.offer.price?.eur).toBe(456.9);
    expect(out.accepted?.offer.url).toMatch(/awin1\.com/);
    expect(out.autoUrl?.url).toContain("pccomponentes.pt/amd-ryzen-7-9800x3d-47-52ghz-box");
    expect(out.requests).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("looks a pinned URL up in the feed", async () => {
    const out = await scrapePair(
      input({
        target: cooler,
        productName: cooler.name,
        state: {
          manualUrl: "https://www.pccomponentes.pt/noctua-nh-d15s-chromax-black",
          autoUrl: null,
          autoUrlFailures: 0,
        },
      }),
      walled(),
      { now },
    );
    expect(out.accepted?.via).toBe("manual");
    const missing = await scrapePair(
      input({
        state: { manualUrl: "https://www.pccomponentes.pt/x", autoUrl: null, autoUrlFailures: 0 },
      }),
      walled(),
      { now },
    );
    expect(missing.status).toBe("not_found");
  });

  it("reports products the shop doesn't list as not found", async () => {
    const out = await scrapePair(input({ feed: new FeedIndex([]) }), walled(), { now });
    expect(out.status).toBe("not_found");
  });
});

describe("feed config and download", () => {
  it("reads feed URLs per merchant slug from AWIN_FEEDS", () => {
    const env = { AWIN_FEEDS: '{"worten":"https://productdata.awin.com/x","bad":"http://x"}' };
    expect(feedUrlFor("worten", env)).toBe("https://productdata.awin.com/x");
    expect(feedUrlFor("bad", env)).toBeNull();
    expect(feedUrlFor("worten", { AWIN_FEEDS: "not json" })).toBeNull();
    expect(feedUrlFor("worten", {})).toBeNull();
  });

  it("decodes gzip and plain feeds and redacts keys in logs", () => {
    expect(decodeFeed(gzipSync("a,b\n1,2"))).toBe("a,b\n1,2");
    expect(decodeFeed(new TextEncoder().encode("plain"))).toBe("plain");
    expect(
      redactFeedUrl("https://productdata.awin.com/datafeed/download/apikey/SECRET/fid/1/"),
    ).not.toContain("SECRET");
  });
});

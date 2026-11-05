import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FeedIndex, feedDelimiter, feedOffers, matchOffer, parseCsv } from "../src";
import { cooler, cpu } from "./products";

const csv = readFileSync(new URL("./fixtures/feeds/awin-sample.csv", import.meta.url), "utf-8");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and a BOM", () => {
    expect(parseCsv('\ufeffa,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
    expect(feedDelimiter("a;b;c\n1;2;3")).toBe(";");
  });
});

describe("Awin feed offers", () => {
  const offers = feedOffers(csv);

  it("skips rows without a link and reads prices, stock and identifiers", () => {
    expect(offers).toHaveLength(3);
    const [box, tray] = offers;
    expect(box!.url).toMatch(/^https:\/\/www\.awin1\.com\//);
    expect(box!.canonicalUrl).toContain("pccomponentes.pt/amd-ryzen-7-9800x3d-47-52ghz-box");
    expect(box!.price?.eur).toBe(456.9);
    expect(box!.stock).toBe("in_stock");
    expect(box!.gtins).toEqual(["00730143315289"]);
    expect(box!.mpn).toBe("100-100001084WOF");
    expect(tray!.title).toBe('Processador AMD Ryzen 7 9800X3D Tray, "sem cooler"');
    expect(tray!.stock).toBe("out_of_stock");
  });

  it("finds candidates by identifier, URL or name tokens, and they score like pages", () => {
    const index = new FeedIndex(offers);
    const cands = index.candidates(cpu);
    expect(cands[0]!.title).toContain("Box");
    const best = cands.map((o) => matchOffer(cpu, o)).find((d) => d.decision === "accept");
    expect(best).toBeDefined();
    expect(index.candidates(cooler)[0]!.title).toContain("Noctua");
    expect(
      index.byCanonicalUrl("https://www.pccomponentes.pt/noctua-nh-d15s-chromax-black#reviews"),
    ).toBeDefined();
  });

  it("converts other currencies with the given rates", () => {
    const gbp = feedOffers(
      "product_name,search_price,currency,merchant_deep_link\nX,85,GBP,https://s.uk/x",
      {
        GBP: 0.85,
      },
    );
    expect(gbp[0]!.price?.eur).toBe(100);
  });
});

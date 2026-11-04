import { describe, expect, it } from "vitest";
import { parseAttributes } from "../src/match/attributes";
import { toCategory } from "../src/match/category";
import { mpnMatches } from "../src/match/identifiers";
import { nextAutoUrlState, planIdentifierUpdates, selectBestOffer } from "../src/match/learn";
import { matchOffer, prefilterLinks, THRESHOLDS } from "../src/match/score";
import { normalizeTitle } from "../src/match/text";
import { referenceTokens } from "../src/match/tokens";
import type { MatchDecision } from "../src/match/types";
import { asinFromUrl, canonicalUrl, isJunkLink, looksLikeSearchUrl } from "../src/match/url";
import { cpu, gpu, offer, pcCase, psu, ram } from "./products";

describe("text and tokens", () => {
  it("repairs shop spellings of model names", () => {
    expect(normalizeTitle("AMD RYZEN™ 7 9800X 3D")).toBe("amd ryzen 7 9800x3d");
    expect(normalizeTitle("RTX5070Ti")).toBe("rtx 5070 ti");
    expect(normalizeTitle("32GB (2 x 16GB)")).toBe("32gb (2x16gb)");
  });
  it("classifies reference tokens", () => {
    const t = Object.fromEntries(referenceTokens(cpu).map((x) => [x.form, x.cls]));
    expect(t).toMatchObject({ amd: "brand", ryzen: "plain", "7": "variant", "9800x3d": "model" });
    // The name's "8-Core" / "4.7 GHz" are attributes, not model tokens.
    expect(t["8core"]).toBeUndefined();
    const p = Object.fromEntries(referenceTokens(psu).map((x) => [x.form, x.cls]));
    expect(p).toMatchObject({ bequiet: "brand", "12": "variant" });
  });
});

describe("attributes", () => {
  it("parses a RAM kit", () => {
    expect(parseAttributes(normalizeTitle(ram.name), "ram")).toMatchObject({
      layout: { modules: 2, sizeGb: 16 },
      totalGb: 32,
      ddr: 5,
      speedMts: 6000,
      cl: 30,
    });
  });
  it("parses PSU power and tier, and does not read PCIe x2 as a pack", () => {
    expect(parseAttributes(normalizeTitle(psu.name), "psu")).toMatchObject({
      watts: [1000],
      tiers: ["platinum"],
    });
    expect(
      parseAttributes(normalizeTitle("Samsung 990 EVO Plus 2TB PCIe 5.0 x2"), "ssd").packSize,
    ).toBeUndefined();
  });
});

describe("identifiers and URLs", () => {
  it("compares MPNs", () => {
    expect(mpnMatches("100-100001084WOF", "100100001084wof")).toBe(true);
    expect(mpnMatches("100-100001084WOF", "100-100001084")).toBe(false);
    expect(mpnMatches("MZ-V9S2T0BW", "MZ-V9S2T0BW/EU")).toBe(true);
  });
  it("canonicalizes Amazon and tracking URLs", () => {
    expect(
      canonicalUrl("https://www.amazon.es/-/en/AMD-9800X3D/dp/B0DQ86KCP2/ref=sr_1_6?dib=x"),
    ).toBe("https://www.amazon.es/dp/B0DQ86KCP2");
    expect(canonicalUrl("https://www.pcbem.pt/loja/x/?utm_source=a#reviews")).toBe(
      "https://www.pcbem.pt/loja/x",
    );
    expect(asinFromUrl("https://www.amazon.fr/dp/B0DKFMSMYK")).toBe("B0DKFMSMYK");
  });
  it("A11: detects junk links (PCBem add-to-cart)", () => {
    expect(isJunkLink("https://www.pcbem.pt/wp-admin/admin-ajax.php?add-to-cart=9993860")).toBe(
      true,
    );
    expect(isJunkLink("/?add-to-cart=9905074")).toBe(true);
    expect(isJunkLink("javascript:void(0)")).toBe(true);
    expect(isJunkLink("https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d/")).toBe(false);
    expect(isJunkLink("https://www.pcbem.pt/")).toBe(true);
    expect(isJunkLink("https://www.pcbem.pt")).toBe(true);
  });
  it("A8: detects search URLs", () => {
    expect(looksLikeSearchUrl("https://www.worten.pt/search?query=9800x3d")).toBe(true);
    expect(looksLikeSearchUrl("https://www.radiopopular.pt/pesquisa/AMD%20Ryzen")).toBe(true);
    expect(looksLikeSearchUrl("https://www.amazon.es/s?k=9800x3d")).toBe(true);
    expect(
      looksLikeSearchUrl("https://www.globaldata.pt/processador-amd/100-100001084WOF.html"),
    ).toBe(false);
  });
  it("maps product categories", () => {
    expect(toCategory("cpu")).toBe("cpu");
    expect(toCategory("Video Card")).toBe("gpu");
    expect(toCategory("Power Supply")).toBe("psu");
    expect(toCategory(null)).toBe("other");
  });
});

describe("matchOffer thresholds", () => {
  it("accepts a perfect title with a plausible price, without identifiers", () => {
    const d = matchOffer(pcCase, offer("Fractal Design Pop XL Air Black TG", 125));
    expect(d.score).toBeGreaterThanOrEqual(THRESHOLDS.accept);
    expect(d.decision).toBe("accept");
  });
  it("sends a weaker title to review", () => {
    // "OC" but not "OC PLUS": a sibling SKU, so a human should look.
    const d = matchOffer(gpu, offer("MSI GeForce RTX 5070 Ti 16G GAMING TRIO OC", 1150));
    expect(d.decision).toBe("review");
  });
  it("never auto-accepts listing data", () => {
    const d = matchOffer(cpu, { ...offer("AMD Ryzen 7 9800X3D Box", 410), stage: "listing" });
    expect(d.score).toBeGreaterThanOrEqual(THRESHOLDS.accept);
    expect(d.decision).toBe("review");
  });
  it("A12: no price is reported apart from a wrong product", () => {
    const d = matchOffer(cpu, offer("AMD Ryzen 7 9800X3D", null));
    expect(d).toMatchObject({ decision: "reject", noPrice: true, vetoes: ["A12-no-price"] });
  });
  it("A16: a pinned URL is never rejected, but gets a warning when the rules would", () => {
    const d = matchOffer(cpu, offer("AMD Ryzen 7 9800X3D Tray", 400), {}, { pinned: true });
    expect(d).toMatchObject({ decision: "accept", ruleDecision: "reject", warning: true });
  });
});

describe("prefilterLinks", () => {
  it("drops junk, search and wrong links and keeps the best", () => {
    const { kept, dropped } = prefilterLinks(cpu, [
      {
        url: "https://www.pcbem.pt/wp-admin/admin-ajax.php?add-to-cart=9993860",
        text: "Adicionar ao carrinho",
      },
      {
        url: "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-c-turbo-5-2ghz-104mb/",
        text: "",
      },
      {
        url: "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-ate-5-2ghz-104mb-tray/",
        text: "",
      },
      { url: "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x-8-core/", text: "AMD Ryzen 7 9800X" },
      { url: "https://www.pcbem.pt/?s=9800x3d", text: "Ver todos" },
    ]);
    expect(kept.map((k) => k.url)).toEqual([
      "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d-8-core-4-7ghz-c-turbo-5-2ghz-104mb/",
    ]);
    expect(dropped.map((d) => d.rule)).toEqual([
      "A11-junk-link",
      "A9:B4-packaging",
      "A10-link-score",
      "A8-not-product",
    ]);
  });
});

describe("learning", () => {
  const accepted = (o: ReturnType<typeof offer>): MatchDecision => matchOffer(cpu, o);
  const page = offer("AMD Ryzen 7 9800X3D Box", 420, {
    gtins: ["00730143315289"],
    mpn: "100-100001084WOF",
  });

  it("confirms a learned code once two merchants agree", () => {
    const existing = [
      {
        kind: "gtin" as const,
        value: "00730143315289",
        source: "learned" as const,
        confirmed: false,
        confidence: 0.5,
        sightings: [{ merchantId: "globaldata", url: "g", at: 1 }],
      },
    ];
    const updates = planIdentifierUpdates({
      existing,
      offer: page,
      decision: accepted(page),
      merchantId: "pcdiga",
      now: 2,
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        op: "update",
        value: "00730143315289",
        confirmed: true,
        confidence: 1,
      }),
    );
  });
  it("does not learn from review, pinned or weak-title matches, and never touches user codes", () => {
    const review = matchOffer(gpu, offer("MSI GeForce RTX 5070 Ti 16G GAMING TRIO OC", 1150));
    expect(review.decision).toBe("review");
    expect(
      planIdentifierUpdates({
        existing: [],
        offer: page,
        decision: review,
        merchantId: "m",
        now: 0,
      }),
    ).toEqual([]);
    expect(
      planIdentifierUpdates({
        existing: [],
        offer: page,
        decision: accepted(page),
        merchantId: "m",
        now: 0,
        pinned: true,
      }),
    ).toEqual([]);
    const user = [
      {
        kind: "mpn" as const,
        value: "100-100001084WOF",
        source: "user" as const,
        confirmed: true,
        sightings: [],
      },
    ];
    const ups = planIdentifierUpdates({
      existing: user,
      offer: page,
      decision: accepted(page),
      merchantId: "m",
      now: 0,
    });
    expect(ups.find((u) => u.kind === "mpn")).toBeUndefined();
  });
  it("A15: drops an auto URL after 3 failed revalidations", () => {
    expect(nextAutoUrlState(0, "reject")).toEqual({ failures: 1, drop: false });
    expect(nextAutoUrlState(2, "review")).toEqual({ failures: 3, drop: true });
    expect(nextAutoUrlState(2, "accept")).toEqual({ failures: 0, drop: false });
  });
  it("B15: keeps the cheapest in-stock offer", () => {
    const a = offer("AMD Ryzen 7 9800X3D", 420, { url: "https://s.pt/a" });
    const b = offer("AMD Ryzen 7 9800X3D", 400, { url: "https://s.pt/b", stock: "out_of_stock" });
    const c = offer("AMD Ryzen 7 9800X3D", 410, { url: "https://s.pt/c" });
    const best = selectBestOffer(
      [a, b, c].map((o) => ({ offer: o, decision: matchOffer(cpu, o) })),
    );
    expect(best?.offer.url).toBe("https://s.pt/c");
  });
});

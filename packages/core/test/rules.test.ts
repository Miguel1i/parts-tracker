/** One describe per rule: at least one must-reject and one must-accept case each. */
import { describe, expect, it } from "vitest";
import { refurbishedRule } from "../src/rules/a01-refurbished";
import { variantRule } from "../src/rules/a02-variants";
import { tierRule } from "../src/rules/a03-tier";
import { priceCurve, priceRule } from "../src/rules/a04-price";
import { prebuiltRule } from "../src/rules/a05-prebuilt";
import { identifierRule } from "../src/rules/a06-identifiers";
import { titleRule } from "../src/rules/a07-title";
import { notProductRule } from "../src/rules/a08-not-product";
import { sellerRule } from "../src/rules/a13-seller";
import { blocklistRule } from "../src/rules/a14-blocklist";
import { attributesRule } from "../src/rules/attributes";
import { connectivityRule } from "../src/rules/b01-connectivity";
import { gpuLineRule } from "../src/rules/b02-gpu-line";
import { modelSuffixRule } from "../src/rules/b03-model-suffix";
import { packagingRule } from "../src/rules/b04-packaging";
import { colourRule } from "../src/rules/b05-colour";
import { capacityRule } from "../src/rules/b06-capacity";
import { memoryRule } from "../src/rules/b07-memory";
import { accessoryRule } from "../src/rules/b08-accessory";
import { categoryRule } from "../src/rules/b09-category";
import { multipackRule } from "../src/rules/b10-multipack";
import { regionalRule } from "../src/rules/b11-regional";
import { brandRule } from "../src/rules/b14-brand";
import { buildContext, type Rule } from "../src/rules/context";
import type { MatchMerchant, MatchTarget, Offer, RuleResult } from "../src/match/types";
import { board, cooler, corsair, cpu, gpu, offer, pcCase, psu, ram, ssd } from "./products";

function run(rule: Rule, target: MatchTarget, o: Offer, merchant: MatchMerchant = {}): RuleResult {
  const r = rule.run(buildContext(target, o, merchant));
  return (Array.isArray(r) ? r[0] : r)!;
}
const verdict = (
  rule: Rule,
  target: MatchTarget,
  title: string,
  extra: Partial<Offer> = {},
  merchant?: MatchMerchant,
) =>
  run(rule, target, offer(title, extra.price === undefined ? 400 : null, extra), merchant).verdict;

describe("A1 refurbished", () => {
  it.each([
    "AMD Ryzen 7 9800X3D (Recondicionado)",
    "AMD Ryzen 7 9800X3D Reacondicionado",
    "AMD Ryzen 7 9800X3D - Amazon Renewed",
    "AMD Ryzen 7 9800X3D Open Box",
    "AMD Ryzen 7 9800X3D d'occasion",
    "AMD Ryzen 7 9800X3D Generalüberholt",
  ])("rejects %s", (title) => expect(verdict(refurbishedRule, cpu, title)).toBe("veto"));
  it("rejects a refurbished URL and a JSON-LD condition", () => {
    expect(
      verdict(refurbishedRule, cpu, "AMD Ryzen 7 9800X3D", {
        url: "https://s.pt/outlet/ryzen-9800x3d",
      }),
    ).toBe("veto");
    expect(verdict(refurbishedRule, cpu, "AMD Ryzen 7 9800X3D", { condition: "used" })).toBe(
      "veto",
    );
  });
  it("accepts a new offer, and refurbished when the product allows it", () => {
    expect(verdict(refurbishedRule, cpu, "AMD Ryzen 7 9800X3D Box")).toBe("pass");
    expect(
      verdict(
        refurbishedRule,
        { ...cpu, spec: { condition: "any" } },
        "AMD Ryzen 7 9800X3D Recondicionado",
      ),
    ).toBe("pass");
  });
});

describe("A2 variant words", () => {
  it("rejects 5070 Ti vs 5070, EVO Plus vs EVO, Tomahawk MAX vs Tomahawk", () => {
    expect(verdict(variantRule, gpu, "MSI GeForce RTX 5070 GAMING TRIO OC PLUS 12GB")).toBe("veto");
    expect(verdict(variantRule, ssd, "Samsung 990 EVO 2TB")).toBe("veto");
    expect(verdict(variantRule, ssd, "Samsung 990 PRO 2TB")).toBe("veto");
    expect(verdict(variantRule, board, "MSI MAG B850 TOMAHAWK WIFI")).toBe("veto");
    expect(verdict(variantRule, ram, "G.Skill Trident Z5 RGB 32GB DDR5-6000 CL30")).toBe("veto");
  });
  it("accepts matching variants and ignores 80 Plus / Max Boost noise", () => {
    expect(verdict(variantRule, gpu, "MSI GeForce RTX 5070 Ti 16G GAMING TRIO OC PLUS")).toBe(
      "pass",
    );
    expect(verdict(variantRule, gpu, "MSI RTX5070Ti Gaming Trio OC Plus")).toBe("pass");
    expect(verdict(variantRule, cpu, "AMD Ryzen 7 9800X3D up to 5.2 GHz Max Boost")).toBe("pass");
    expect(verdict(variantRule, psu, "be quiet! Straight Power 12 1000W 80 Plus Platinum")).toBe(
      "pass",
    );
  });
  it("only fails extra variants on a truncated search link", () => {
    const link = { stage: "link" as const };
    expect(verdict(variantRule, ssd, "Samsung 990 EVO", link)).toBe("pass");
    expect(verdict(variantRule, ssd, "Samsung 990 EVO Plus PRO", link)).toBe("veto");
  });
});

describe("A3 efficiency tier", () => {
  it("rejects Gold for a Platinum PSU", () =>
    expect(verdict(tierRule, psu, "be quiet! Straight Power 12 1000W 80 Plus Gold")).toBe("veto"));
  it("accepts Platinum, or no tier stated", () => {
    expect(verdict(tierRule, psu, "be quiet! Straight Power 12 1000W 80+ Platinum")).toBe("pass");
    expect(verdict(tierRule, psu, "be quiet! Straight Power 12 1000W")).toBe("pass");
  });
});

describe("A4 price", () => {
  it("vetoes beyond 0.35×–3×", () => {
    expect(run(priceRule, cpu, offer("AMD Ryzen 7 9800X3D", 3799.9)).verdict).toBe("veto");
    expect(run(priceRule, cpu, offer("AMD Ryzen 7 9800X3D", 100)).verdict).toBe("veto");
  });
  it("boosts a plausible price and penalizes a far one in proportion", () => {
    expect(run(priceRule, cpu, offer("AMD Ryzen 7 9800X3D", 456.9))).toMatchObject({
      verdict: "boost",
      weight: 10,
    });
    const far = run(priceRule, cpu, offer("AMD Ryzen 7 9800X3D", 852.73));
    expect(far.verdict).toBe("penalty");
    expect(far.weight).toBeLessThan(-20);
  });
  it("uses the median of recent prices when there is no refPrice", () => {
    const t = { ...cpu, refPrice: null, recentPrices: [400, 410, 420] };
    expect(run(priceRule, t, offer("AMD Ryzen 7 9800X3D", 1500)).verdict).toBe("veto");
    expect(run(priceRule, t, offer("AMD Ryzen 7 9800X3D", 415)).verdict).toBe("boost");
  });
  it("has a continuous curve", () => {
    expect(priceCurve(0.8)).toBe(10);
    expect(priceCurve(2)).toBeCloseTo(-20);
    expect(priceCurve(0.5)).toBeCloseTo(-20);
    expect(priceCurve(3)).toBeCloseTo(-35);
  });
});

describe("A5 prebuilt / bundle", () => {
  it.each([
    "Computador King Mod Gamer-PC HAVN Ryzen 7 9800X3D 32GB DDR5 2TB RTX 5080",
    "Desktop Gaming EPICAL-Q Xrinker EVO (AMD Ryzen 7 9800X3D)",
    "Portátil ASUS ROG Ryzen 7 9800X3D",
    "Bundle Processador 9800X3D Kingston 32GB Fury",
    "AMD Ryzen 7 9800X3D + B850 Tomahawk",
    "Kit Upgrade AMD Ryzen 7 9800X3D",
  ])("rejects %s", (title) => expect(verdict(prebuiltRule, cpu, title)).toBe("veto"));
  it("accepts the bare part, and RAM kits", () => {
    expect(verdict(prebuiltRule, cpu, "AMD Ryzen 7 9800X3D Desktop Processor")).toBe("pass");
    expect(
      verdict(prebuiltRule, ram, "G.Skill Trident Z5 Neo Kit 32GB (2x16GB) DDR5-6000 CL30"),
    ).toBe("pass");
    expect(verdict(prebuiltRule, psu, "be quiet! Straight Power 12 1000W 80+ Platinum")).toBe(
      "pass",
    );
  });
});

describe("A6 identifiers", () => {
  it("vetoes a GTIN that differs from a confirmed one", () => {
    const r = run(
      identifierRule,
      corsair,
      offer("Corsair HX1200i", 300, { gtins: ["00840440495000"] }),
    );
    expect(r.verdict).toBe("veto");
  });
  it("only penalizes a mismatch with an unconfirmed learned GTIN", () => {
    const r = run(
      identifierRule,
      psu,
      offer("be quiet! Straight Power 12 1000W", 280, { gtins: ["04260052189999"] }),
    );
    expect(r).toMatchObject({ verdict: "penalty", weight: -10 });
  });
  it("treats UPC-12 and EAN-13 as the same code", () => {
    const t: MatchTarget = {
      ...cpu,
      identifiers: [{ kind: "gtin", value: "00730143315289", source: "user", confirmed: true }],
    };
    expect(
      run(identifierRule, t, offer("AMD Ryzen 7 9800X3D", 400, { gtins: ["00730143315289"] })),
    ).toMatchObject({
      verdict: "boost",
      weight: 45,
    });
  });
  it("boosts an MPN with a regional suffix and an ASIN", () => {
    expect(
      run(identifierRule, ssd, offer("Samsung 990 EVO Plus 2TB", 300, { mpn: "MZ-V9S2T0BW/EU" }))
        .weight,
    ).toBe(20);
    expect(
      run(identifierRule, cpu, offer("AMD Ryzen 7 9800X3D", 400, { asin: "B0DKFMSMYK" })).weight,
    ).toBe(45);
  });
  it("finds a code printed on a product page", () => {
    const r = run(
      identifierRule,
      board,
      offer("MSI MAG B850 TOMAHAWK MAX WIFI", 250, { text: "Ref. 601-7E62-02S" }),
    );
    expect(r).toMatchObject({ verdict: "boost", weight: 10 });
  });
});

describe("A7 title", () => {
  it("vetoes a missing model token", () => {
    expect(verdict(titleRule, cpu, "AMD Ryzen 7 9850X3D")).toBe("veto");
    expect(verdict(titleRule, cooler, "Noctua NH-U12S chromax.black")).toBe("veto");
  });
  it("matches across spacing and punctuation differences", () => {
    expect(run(titleRule, cooler, offer("Noctua NH D15S Chromax Black", 110)).verdict).toBe(
      "boost",
    );
    expect(run(titleRule, cpu, offer("AMD RYZEN ™ 7 9800X 3D Desktop Processor", 440)).weight).toBe(
      50,
    );
  });
  it("weighs filler words least", () => {
    const r = run(titleRule, pcCase, offer("Fractal Design Pop XL Air", 120));
    expect(r.weight).toBe(50);
  });
});

describe("A8 not a product page", () => {
  it("rejects search URLs and listing pages", () => {
    expect(
      verdict(notProductRule, cpu, "x", {
        url: "https://www.pcbem.pt/?s=9800x3d&post_type=product",
      }),
    ).toBe("veto");
    expect(
      verdict(notProductRule, cpu, "x", {
        url: "https://www.pcbem.pt/loja/categoria/processadores/",
      }),
    ).toBe("veto");
    expect(verdict(notProductRule, cpu, "x", { pageKind: "listing" })).toBe("veto");
  });
  it("accepts product URLs, including Amazon result links with ?keywords=", () => {
    expect(
      verdict(notProductRule, cpu, "x", {
        url: "https://www.amazon.es/-/pt/dp/B0DKFMSMYK/ref=sr_1_1?keywords=AMD",
      }),
    ).toBe("pass");
    expect(
      verdict(notProductRule, cpu, "x", {
        url: "https://www.pcbem.pt/loja/amd-am5-ryzen-7-9800x3d/",
      }),
    ).toBe("pass");
  });
});

describe("A13 seller", () => {
  const own = { ownOnly: true };
  it("vetoes a marketplace seller at an own-only shop, with the seller as evidence", () => {
    const r = run(
      sellerRule,
      cpu,
      offer("AMD Ryzen 7 9800X3D", 442, { seller: { name: "ON4TECH", own: false, evidence: "m" } }),
      own,
    );
    expect(r).toMatchObject({ verdict: "veto", params: { seller: "ON4TECH" } });
  });
  it("penalizes an unknown seller and accepts the shop or any seller elsewhere", () => {
    expect(run(sellerRule, cpu, offer("x", 400), own)).toMatchObject({
      verdict: "penalty",
      weight: -10,
    });
    expect(
      verdict(sellerRule, cpu, "x", { seller: { name: "Worten", own: true, evidence: "" } }, own),
    ).toBe("pass");
    expect(
      verdict(sellerRule, cpu, "x", { seller: { name: "ON4TECH", own: false, evidence: "" } }),
    ).toBe("pass");
  });
});

describe("A14 blocklist", () => {
  it("vetoes by URL (canonicalized), by title and by external ID", () => {
    const url =
      "https://www.worten.pt/produtos/fonte-de-alimentacao-corsair-hx750-atx-750-w-80-plus-platinum-7377192?utm_source=x";
    expect(verdict(blocklistRule, corsair, "Corsair HX750", { url })).toBe("veto");
    expect(
      verdict(
        blocklistRule,
        corsair,
        "Fonte de Alimentação CORSAIR HX750 (ATX - 750 W - 80 Plus Platinum)",
      ),
    ).toBe("veto");
    const t = { ...cpu, blocklist: [{ externalId: "B0GSTPQJSC" }] };
    expect(
      verdict(blocklistRule, t, "9800X3D", { url: "https://www.amazon.es/x/dp/B0GSTPQJSC/ref=a" }),
    ).toBe("veto");
  });
  it("accepts other offers", () =>
    expect(
      verdict(blocklistRule, corsair, "Corsair HX1200i (2025)", {
        url: "https://www.worten.pt/produtos/hx1200i",
      }),
    ).toBe("pass"));
});

describe("B1 connectivity", () => {
  it("rejects the non-WiFi board, and WiFi when the product has none", () => {
    expect(verdict(connectivityRule, board, "MSI MAG B850 TOMAHAWK MAX")).toBe("veto");
    const noWifi = {
      ...board,
      name: "MSI MAG B850 TOMAHAWK MAX",
      query: "MSI MAG B850 TOMAHAWK MAX",
    };
    expect(verdict(connectivityRule, noWifi, "MSI MAG B850 TOMAHAWK MAX WIFI")).toBe("veto");
  });
  it("accepts Wi-Fi spelled differently", () =>
    expect(verdict(connectivityRule, board, "MSI MAG B850 TOMAHAWK MAX Wi-Fi 7")).toBe("pass"));
});

describe("B2 GPU line / OC", () => {
  it("rejects another board line", () => {
    expect(verdict(gpuLineRule, gpu, "MSI GeForce RTX 5070 Ti VENTUS 3X OC 16GB")).toBe("veto");
    expect(verdict(gpuLineRule, gpu, "MSI GeForce RTX 5070 Ti SHADOW 3X OC")).toBe("veto");
  });
  it("penalizes OC vs OC PLUS and accepts the same line", () => {
    expect(
      run(gpuLineRule, gpu, offer("MSI GeForce RTX 5070 Ti GAMING TRIO OC 16G", 1100)),
    ).toMatchObject({
      verdict: "penalty",
      weight: -10,
    });
    expect(verdict(gpuLineRule, gpu, "MSI GeForce RTX 5070 Ti 16G GAMING TRIO OC PLUS")).toBe(
      "pass",
    );
  });
});

describe("B3 model suffix", () => {
  it("rejects 9800X for 9800X3D, and B850M for B850", () => {
    expect(run(modelSuffixRule, cpu, offer("AMD Ryzen 7 9800X", 300)).evidence).toContain("9800x");
    expect(verdict(modelSuffixRule, cpu, "AMD Ryzen 7 9800X Box")).toBe("veto");
    expect(verdict(modelSuffixRule, board, "MSI MAG B850M TOMAHAWK MAX WIFI")).toBe("veto");
  });
  it("accepts the exact model", () =>
    expect(verdict(modelSuffixRule, cpu, "AMD Ryzen 7 9800X3D")).toBe("pass"));
});

describe("B4 packaging", () => {
  it.each([
    "AMD Ryzen 7 9800X3D Tray",
    "AMD Ryzen 7 9800X3D (sem caixa/sem ventilador)",
    "AMD Ryzen 7 9800X3D bandeja",
    "AMD Ryzen 7 9800X3D MPK",
  ])("rejects %s when the product is boxed", (title) =>
    expect(verdict(packagingRule, cpu, title)).toBe("veto"),
  );
  it("accepts box / WOF / unstated, and tray when any packaging is fine", () => {
    expect(verdict(packagingRule, cpu, "AMD Ryzen 9 9800X3D WOF (sem dissipador incluído)")).toBe(
      "pass",
    );
    expect(verdict(packagingRule, cpu, "AMD Ryzen 7 9800X3D")).toBe("pass");
    expect(verdict(packagingRule, { ...cpu, spec: {} }, "AMD Ryzen 7 9800X3D Tray")).toBe("pass");
  });
});

describe("B5 colour / edition", () => {
  it("rejects another colour", () => {
    expect(verdict(colourRule, cooler, "Noctua NH-D15S Brown")).toBe("veto");
    expect(
      verdict(
        colourRule,
        { ...pcCase, name: "Fractal Design Pop XL Air White" },
        "Fractal Design Pop XL Air Black",
      ),
    ).toBe("veto");
  });
  it("accepts the same colour in another language, or no colour on either side", () => {
    expect(verdict(colourRule, cooler, "Noctua NH-D15S chromax.black Preto")).toBe("pass");
    expect(verdict(colourRule, pcCase, "Fractal Design Pop XL Air Black")).toBe("pass");
    expect(verdict(colourRule, gpu, "MSI RTX 5070 Ti Gaming Trio OC Plus")).toBe("pass");
  });
});

describe("B6 capacity / size", () => {
  it("rejects 1TB for 2TB, 750W for 1000W, 12GB for 16GB", () => {
    expect(verdict(capacityRule, ssd, "Samsung 990 EVO Plus 1TB")).toBe("veto");
    expect(verdict(capacityRule, psu, "be quiet! Straight Power 12 750W")).toBe("veto");
    expect(verdict(capacityRule, gpu, "MSI RTX 5070 Ti Gaming Trio OC Plus 12GB")).toBe("veto");
  });
  it("accepts 2 TB written as 2000GB, and a title without a size", () => {
    expect(verdict(capacityRule, ssd, "Samsung 990 EVO Plus 2000 GB NVMe")).toBe("pass");
    expect(verdict(capacityRule, psu, "be quiet! Straight Power 12 1000 W")).toBe("pass");
    expect(verdict(capacityRule, ssd, "Samsung 990 EVO Plus")).toBe("pass");
  });
});

describe("B7 memory kit", () => {
  it("rejects another layout, total or speed", () => {
    expect(verdict(memoryRule, ram, "G.Skill Trident Z5 Neo 32GB (1x32GB) DDR5-6000 CL30")).toBe(
      "veto",
    );
    expect(verdict(memoryRule, ram, "G.Skill Trident Z5 Neo 64GB (2x32GB) DDR5-6000 CL30")).toBe(
      "veto",
    );
    expect(verdict(memoryRule, ram, "G.Skill Trident Z5 Neo 32GB (2x16GB) DDR5-6400 CL32")).toBe(
      "veto",
    );
  });
  it("penalizes another CL and accepts the same kit", () => {
    expect(
      run(memoryRule, ram, offer("G.Skill Trident Z5 Neo 32GB (2x16GB) DDR5 6000MHz CL36", 150)),
    ).toMatchObject({
      verdict: "penalty",
      weight: -10,
    });
    expect(verdict(memoryRule, ram, "G.Skill Trident Z5 Neo Kit 2 x 16 GB DDR5-6000 C30")).toBe(
      "pass",
    );
  });
});

describe("B8 accessory", () => {
  it.each([
    "Backplate para MSI RTX 5070 Ti Gaming Trio",
    "Waterblock EK-Quantum RTX 5070 Ti Gaming Trio",
    "Suporte compatível com RTX 5070 Ti",
  ])("rejects %s", (title) => expect(verdict(accessoryRule, gpu, title)).toBe("veto"));
  it("rejects a cooler 'for' the CPU", () =>
    expect(verdict(accessoryRule, cpu, "Cooler for AMD Ryzen 7 9800X3D")).toBe("veto"));
  it("accepts accessory words after the model", () => {
    expect(
      verdict(accessoryRule, psu, "be quiet! Straight Power 12 1000W com cabos modulares"),
    ).toBe("pass");
    expect(verdict(accessoryRule, cpu, "AMD Ryzen 7 9800X3D para gaming")).toBe("pass");
  });
});

describe("B9 category", () => {
  it("rejects a cooler or a PC by breadcrumb or URL", () => {
    expect(
      verdict(categoryRule, cpu, "AMD Ryzen 7 9800X3D", {
        categoryHints: ["Componentes", "Refrigeração CPU"],
      }),
    ).toBe("veto");
    expect(
      verdict(categoryRule, cpu, "AMD Ryzen 7 9800X3D", {
        url: "https://www.globaldata.pt/computador-king-mod-ryzen-7-9800x3d/KM.html",
      }),
    ).toBe("veto");
  });
  it("accepts matching breadcrumbs and URLs that only mention other words later", () => {
    expect(
      verdict(categoryRule, cpu, "x", {
        categoryHints: ["Computadores", "Componentes Internos", "Cpus"],
      }),
    ).toBe("pass");
    expect(
      verdict(categoryRule, cpu, "x", {
        url: "https://www.pcdiga.com/componentes/processadores/processador-amd-ryzen-sem-cooler",
      }),
    ).toBe("pass");
  });
});

describe("B10 multipack", () => {
  const fan: MatchTarget = {
    name: "Arctic P12 PWM PST",
    query: "Arctic P12 PWM PST",
    category: "fan",
    brand: "Arctic",
    identifiers: [],
  };
  it("rejects a pack when the product is one", () => {
    expect(verdict(multipackRule, fan, "Arctic P12 PWM PST Pack 5")).toBe("veto");
    expect(verdict(multipackRule, fan, "Arctic P12 PWM PST (3 unidades)")).toBe("veto");
  });
  it("accepts a single fan, or a pack when packs are allowed", () => {
    expect(verdict(multipackRule, fan, "Arctic P12 PWM PST 120mm")).toBe("pass");
    expect(
      verdict(multipackRule, { ...fan, spec: { allowPacks: true } }, "Arctic P12 PWM PST Pack 5"),
    ).toBe("pass");
  });
});

describe("B11 regional", () => {
  it("rejects a UK-plug PSU at a Portuguese shop", () =>
    expect(
      verdict(
        regionalRule,
        psu,
        "be quiet! Straight Power 12 1000W UK Plug",
        {},
        { country: "PT" },
      ),
    ).toBe("veto"));
  it("accepts it at a UK shop and penalizes imports", () => {
    expect(
      verdict(
        regionalRule,
        psu,
        "be quiet! Straight Power 12 1000W UK Plug",
        {},
        { country: "GB" },
      ),
    ).toBe("pass");
    expect(verdict(regionalRule, cpu, "AMD Ryzen 7 9800X3D (Importação)")).toBe("penalty");
  });
});

describe("B14 brand", () => {
  it("rejects another board brand with the same chip", () =>
    expect(verdict(brandRule, gpu, "Gigabyte GeForce RTX 5070 Ti Gaming OC 16G")).toBe("veto"));
  it("only penalizes for CPUs, and ignores chip-maker-only text", () => {
    expect(verdict(brandRule, cpu, "Intel Ryzen 7 9800X3D")).toBe("penalty");
    expect(verdict(brandRule, gpu, "NVIDIA GeForce RTX 5070 Ti Gaming Trio OC Plus")).toBe("pass");
    expect(verdict(brandRule, ram, "G.SKILL Trident Z5 Neo 32GB", { brand: "PCBEM" })).toBe(
      "boost",
    );
  });
});

describe("AT attributes", () => {
  it("adds points for agreeing attributes and removes them for unstated ones", () => {
    expect(
      run(attributesRule, ram, offer("G.Skill Trident Z5 Neo 32GB (2x16GB) DDR5-6000 CL30", 150))
        .weight,
    ).toBe(9);
    expect(run(attributesRule, cooler, offer("Noctua NH-D15S", 100)).verdict).toBe("penalty");
  });
});

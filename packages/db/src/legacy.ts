/**
 * Pure mapping from the legacy Python app's `pc_tracker.json` (v4) to rows of the new schema.
 * No I/O here: `scripts/import-legacy.ts` writes the result to the database.
 */
import { normalizeGtin } from "@parts/core";
import type { ScrapeStatus } from "./schema";

// ---------------------------------------------------------------- legacy shapes

export type LegacyMerchant = {
  search: string;
  enabled?: boolean;
  shipping?: number;
  currency?: string;
  own_only?: boolean;
};

export type LegacyHistoryEntry = {
  /** Local (Europe/Lisbon) naive ISO time, minute precision: "2026-11-03T11:35". */
  t: string;
  /** Price in EUR. */
  p: number;
  /** Shipping in EUR at the time. */
  s?: number;
  u?: string | null;
  /** Original price when the shop's currency isn't EUR. */
  o?: number;
  cur?: string;
};

export type LegacyPrice = {
  /** "dd/mm HH:MM", no year. */
  ts?: string;
  price?: number;
  status?: string;
  name?: string;
  url?: string;
  orig?: number;
  cur?: string;
};

export type LegacyBought = {
  shop: string;
  price: number;
  shipping?: number;
  /** "dd/mm/yyyy" */
  date?: string;
  [key: string]: unknown;
};

export type LegacyComponent = {
  name: string;
  query?: string;
  ref?: {
    url?: string;
    name?: string;
    brand?: string;
    mpn?: string;
    gtin?: string;
    price?: number | null;
    image?: string;
    /** Identifier fields the user typed by hand (vs. read from a page). */
    typed?: string[];
  } | null;
  urls?: Record<string, string>;
  auto?: Record<string, string>;
  prices?: Record<string, LegacyPrice>;
  bought?: LegacyBought | null;
  bad?: Record<string, { url?: string; name?: string }[]>;
  history?: Record<string, LegacyHistoryEntry[]>;
  image?: string;
};

export type LegacyFile = {
  v?: number;
  merchants: Record<string, LegacyMerchant>;
  components: LegacyComponent[];
};

// ---------------------------------------------------------------- output rows

export type MerchantRow = {
  name: string;
  slug: string;
  country: string | null;
  baseUrl: string;
  searchTemplate: string;
  currency: string;
  shipping: number;
  enabled: boolean;
  ownOnly: boolean;
  sortOrder: number;
};

export type ProductPlan = {
  product: {
    name: string;
    category: string | null;
    query: string;
    imageUrl: string | null;
    refUrl: string | null;
    brand: string | null;
    refPrice: number | null;
  };
  identifiers: {
    kind: "gtin" | "mpn" | "asin";
    value: string;
    source: "user" | "learned";
    /** Legacy merchant name the identifier was learned from (ASINs). */
    merchant: string | null;
    confirmed: boolean;
  }[];
  pairs: {
    merchant: string;
    manualUrl: string | null;
    autoUrl: string | null;
    lastStatus: ScrapeStatus | null;
    lastPriceEur: number | null;
    lastCheckedAt: Date | null;
  }[];
  blocklist: { merchant: string; url: string | null; name: string | null }[];
  pricePoints: {
    merchant: string;
    ts: Date;
    priceEur: number;
    priceOrig: number | null;
    currency: string;
    shipping: number | null;
    url: string | null;
  }[];
  buildItem: {
    sortOrder: number;
    boughtAt: Date | null;
    boughtPrice: number | null;
    boughtMerchant: string | null;
  };
};

export type LegacyPlan = {
  merchants: MerchantRow[];
  products: ProductPlan[];
  warnings: string[];
};

// ---------------------------------------------------------------- helpers

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const TLD_COUNTRY: Record<string, string> = {
  pt: "PT",
  es: "ES",
  fr: "FR",
  uk: "GB",
  de: "DE",
  it: "IT",
};

/** Country from the search host's TLD; `.com` and other generic TLDs give null. */
export function countryFromUrl(url: string): string | null {
  const host = new URL(url).hostname;
  const tld = host.split(".").pop() ?? "";
  return TLD_COUNTRY[tld] ?? null;
}

/** Offset of Europe/Lisbon from UTC, in minutes, at the given instant. */
function lisbonOffsetMinutes(utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Lisbon",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - utc.getTime()) / 60_000);
}

/** Converts a Lisbon wall-clock time to a UTC Date. */
export function lisbonToUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset = lisbonOffsetMinutes(new Date(guess));
  const result = new Date(guess - offset * 60_000);
  // Re-check across a DST boundary.
  const offset2 = lisbonOffsetMinutes(result);
  return offset2 === offset ? result : new Date(guess - offset2 * 60_000);
}

/** "2026-11-03T11:35" (Lisbon local) → Date. */
export function parseHistoryTime(t: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return lisbonToUtc(y, mo, d, h, mi);
}

/** "03/11 15:51" (Lisbon local, no year) → Date in `year`. */
export function parsePriceTime(ts: string, year: number): Date | null {
  const m = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(ts.trim());
  if (!m) return null;
  const [, d, mo, h, mi] = m.map(Number) as [number, number, number, number, number];
  return lisbonToUtc(year, mo, d, h, mi);
}

/** "dd/mm/yyyy" → Date at Lisbon midnight. */
export function parseBoughtDate(date: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date?.trim() ?? "");
  if (!m) return null;
  const [, d, mo, y] = m.map(Number) as [number, number, number, number];
  return lisbonToUtc(y, mo, d);
}

/** Legacy Portuguese status text → scrape status. */
export function mapStatus(status: string | undefined): ScrapeStatus | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "ok") return "ok";
  if (s === "sem stock") return "out_of_stock";
  if (s.startsWith("não encontrado") || s.startsWith("sem preço") || s === "marcado errado")
    return "not_found";
  if (/\b(403|429|503|bloquead|captcha)/.test(s)) return "blocked";
  return "error";
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(cpu cooler|cooler|liquid cooler|aio)\b/i, "cpu_cooler"],
  [/\b(processor|processador|cpu)\b/i, "cpu"],
  [/\b(motherboard|placa m[ãa]e|board)\b/i, "motherboard"],
  [/\b(memory|mem[óo]ria|ddr[45]|ram)\b/i, "memory"],
  [/\b(solid state drive|ssd|nvme|hard drive|hdd)\b/i, "storage"],
  [/\b(video card|graphics card|placa gr[áa]fica|geforce|radeon)\b/i, "gpu"],
  [/\b(case|caixa|tower)\b/i, "case"],
  [/\b(power supply|fonte de alimenta[çc][ãa]o|psu)\b/i, "psu"],
];

/** Best-effort category from the product name (the legacy app has no category field). */
export function inferCategory(name: string): string | null {
  for (const [re, category] of CATEGORY_RULES) if (re.test(name)) return category;
  return null;
}

/** Amazon ASIN from a /dp/ or /gp/product/ URL. */
export function asinFromUrl(url: string): string | null {
  const m = /amazon\.[a-z.]+\/(?:.*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(url);
  return m ? m[1]!.toUpperCase() : null;
}

const blank = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

// ---------------------------------------------------------------- mapping

/**
 * Maps the legacy file to rows. `fallbackYear` is used for the year-less `prices[].ts`
 * when no history exists; otherwise the latest history year is used.
 */
export function mapLegacy(file: LegacyFile, fallbackYear = new Date().getFullYear()): LegacyPlan {
  const warnings: string[] = [];
  const merchantNames = new Set(Object.keys(file.merchants));

  const merchants: MerchantRow[] = Object.entries(file.merchants).map(([name, m], i) => {
    const search = new URL(m.search);
    return {
      name,
      slug: slugify(name),
      country: countryFromUrl(m.search),
      baseUrl: search.origin,
      searchTemplate: m.search,
      currency: (m.currency ?? "EUR").toUpperCase(),
      shipping: m.shipping ?? 0,
      enabled: m.enabled ?? true,
      ownOnly: m.own_only ?? false,
      sortOrder: i,
    };
  });

  const knownMerchant = (name: string, where: string) => {
    if (merchantNames.has(name)) return true;
    warnings.push(`unknown merchant "${name}" in ${where}; skipped`);
    return false;
  };

  let latestYear = 0;
  for (const c of file.components)
    for (const entries of Object.values(c.history ?? {}))
      for (const e of entries) latestYear = Math.max(latestYear, Number(e.t.slice(0, 4)) || 0);
  const priceYear = latestYear || fallbackYear;

  const products: ProductPlan[] = file.components.map((c, index) => {
    const ref = c.ref ?? {};
    const typed = new Set(ref.typed ?? []);
    const identifiers: ProductPlan["identifiers"] = [];
    const addId = (id: ProductPlan["identifiers"][number]) => {
      if (!identifiers.some((x) => x.kind === id.kind && x.value === id.value))
        identifiers.push(id);
    };

    const rawGtin = blank(ref.gtin);
    if (rawGtin) {
      const gtin = normalizeGtin(rawGtin);
      if (gtin)
        addId({
          kind: "gtin",
          value: gtin,
          source: typed.has("gtin") ? "user" : "learned",
          merchant: null,
          confirmed: true,
        });
      else warnings.push(`${c.name}: invalid GTIN "${rawGtin}"; skipped`);
    }
    const mpn = blank(ref.mpn);
    if (mpn)
      addId({
        kind: "mpn",
        value: mpn,
        source: typed.has("mpn") ? "user" : "learned",
        merchant: null,
        confirmed: true,
      });

    const pairMerchants = new Set([
      ...Object.keys(c.urls ?? {}),
      ...Object.keys(c.auto ?? {}),
      ...Object.keys(c.prices ?? {}),
    ]);
    const pairs: ProductPlan["pairs"] = [];
    for (const merchant of pairMerchants) {
      if (!knownMerchant(merchant, c.name)) continue;
      const manualUrl = blank(c.urls?.[merchant]);
      const autoUrl = blank(c.auto?.[merchant]);
      const price = c.prices?.[merchant];
      const lastStatus = mapStatus(price?.status);
      pairs.push({
        merchant,
        manualUrl,
        autoUrl,
        lastStatus,
        lastPriceEur:
          lastStatus === "ok" || lastStatus === "out_of_stock" ? (price?.price ?? null) : null,
        lastCheckedAt: price?.ts ? parsePriceTime(price.ts, priceYear) : null,
      });
      for (const url of [manualUrl, autoUrl]) {
        const asin = url ? asinFromUrl(url) : null;
        if (asin)
          addId({
            kind: "asin",
            value: asin,
            source: url === manualUrl ? "user" : "learned",
            merchant,
            confirmed: url === manualUrl,
          });
      }
    }

    const blocklist: ProductPlan["blocklist"] = [];
    for (const [merchant, entries] of Object.entries(c.bad ?? {})) {
      if (!knownMerchant(merchant, `${c.name} blocklist`)) continue;
      for (const b of entries) blocklist.push({ merchant, url: blank(b.url), name: blank(b.name) });
    }

    const pricePoints: ProductPlan["pricePoints"] = [];
    for (const [merchant, entries] of Object.entries(c.history ?? {})) {
      if (!knownMerchant(merchant, `${c.name} history`)) continue;
      for (const e of entries) {
        const ts = parseHistoryTime(e.t);
        if (!ts || typeof e.p !== "number" || !Number.isFinite(e.p)) {
          warnings.push(`${c.name} / ${merchant}: bad history entry ${JSON.stringify(e)}; skipped`);
          continue;
        }
        pricePoints.push({
          merchant,
          ts,
          priceEur: e.p,
          priceOrig: e.o ?? null,
          currency: (e.cur ?? "EUR").toUpperCase(),
          shipping: e.s ?? null,
          url: blank(e.u ?? undefined),
        });
      }
    }

    const bought = c.bought;
    const boughtMerchant =
      bought && knownMerchant(bought.shop, `${c.name} bought`) ? bought.shop : null;

    return {
      product: {
        name: c.name,
        category: inferCategory(c.name),
        query: blank(c.query) ?? c.name,
        imageUrl: blank(c.image) ?? blank(ref.image),
        refUrl: blank(ref.url),
        brand: blank(ref.brand),
        refPrice: typeof ref.price === "number" ? ref.price : null,
      },
      identifiers,
      pairs,
      blocklist,
      pricePoints,
      buildItem: {
        sortOrder: index,
        boughtAt: bought ? (parseBoughtDate(bought.date) ?? null) : null,
        boughtPrice: bought ? bought.price : null,
        boughtMerchant,
      },
    };
  });

  return { merchants, products, warnings };
}

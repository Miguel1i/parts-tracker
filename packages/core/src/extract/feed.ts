/**
 * Affiliate product feeds (Awin "Create-a-Feed" CSV): the shop's own catalogue export, which
 * the scraper reads instead of the shop's bot-walled HTML. Pure: CSV text in, offers out.
 * Columns are read by name, so any column selection works as long as it has a name, a price
 * and a link; EAN/MPN make matching exact.
 */
import { normalizeGtin } from "../gtin";
import { normalizeMpn } from "../match/identifiers";
import type { MatchTarget, Offer, Stock } from "../match/types";
import { canonicalUrl } from "../match/url";
import { toEur, type FxRates } from "./price";

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Guesses the delimiter from the header line (comma, semicolon, pipe or tab). */
export function feedDelimiter(text: string): string {
  const nl = text.indexOf("\n");
  const head = text.slice(0, nl < 0 ? 2000 : nl);
  const counts = [",", ";", "|", "\t"].map((d) => [d, head.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0]![0];
}

const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return undefined;
};

const https = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? u : undefined);

/**
 * Feed rows as offers. `url` is the tracked affiliate link (aw_deep_link) when present, as the
 * network's terms require; `canonicalUrl` is the shop's own product URL, so pinned and learned
 * URLs still line up. Rows without a name, a link or a usable price are skipped.
 */
export function feedOffers(text: string, rates: FxRates = {}): Offer[] {
  const rows = parseCsv(text, feedDelimiter(text));
  const header = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
  const out: Offer[] = [];
  for (const cells of rows) {
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    const title = pick(row, "product_name", "title", "name");
    const shopUrl = https(pick(row, "merchant_deep_link", "link", "product_url"));
    const url = https(pick(row, "aw_deep_link")) ?? shopUrl;
    if (!title || !url) continue;

    const currency = (pick(row, "currency") ?? "EUR").toUpperCase();
    const value = Number(
      (pick(row, "search_price", "store_price", "price") ?? "").replace(",", "."),
    );
    const eur = Number.isFinite(value) && value > 0 ? toEur(value, currency, rates) : null;
    const price =
      eur != null
        ? { value, currency, eur, source: "feed", raw: `${value} ${currency}` }
        : undefined;

    const inStock = pick(row, "in_stock", "availability");
    const qty = Number(pick(row, "stock_quantity") ?? "NaN");
    let stock: Stock = "unknown";
    if (inStock && /^(1|yes|true|in[ _]stock)$/i.test(inStock)) stock = "in_stock";
    else if (inStock && /^(0|no|false|out[ _]of[ _]stock)$/i.test(inStock)) stock = "out_of_stock";
    else if (Number.isFinite(qty)) stock = qty > 0 ? "in_stock" : "out_of_stock";

    const gtins = [pick(row, "ean"), pick(row, "product_gtin", "gtin"), pick(row, "upc")]
      .map((g) => normalizeGtin(g))
      .filter((g): g is string => g != null);
    const image = https(pick(row, "merchant_image_url", "aw_image_url", "large_image"));

    out.push({
      url,
      canonicalUrl: canonicalUrl(shopUrl ?? url),
      stage: "page",
      title,
      titleSource: "feed",
      brand: pick(row, "brand_name", "brand"),
      gtins: [...new Set(gtins)],
      mpn: pick(row, "mpn", "model_number"),
      sku: pick(row, "merchant_product_id"),
      price,
      stock,
      seller: { own: true, evidence: "shop product feed" },
      categoryHints: [pick(row, "merchant_category", "category_name")].filter(
        (c): c is string => !!c,
      ),
      pageKind: "product",
      image: image?.startsWith("https://") ? image : undefined,
    });
  }
  return out;
}

/** Lookups over a feed's offers: by GTIN, MPN, canonical URL, and a loose text pre-match. */
export class FeedIndex {
  private byGtin = new Map<string, Offer[]>();
  private byMpn = new Map<string, Offer[]>();
  private byUrl = new Map<string, Offer>();
  private words: { offer: Offer; tokens: Set<string> }[] = [];

  constructor(readonly offers: Offer[]) {
    const add = (map: Map<string, Offer[]>, key: string, o: Offer) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    };
    for (const o of offers) {
      for (const g of o.gtins) add(this.byGtin, g, o);
      add(this.byMpn, normalizeMpn(o.mpn), o);
      this.byUrl.set(o.canonicalUrl, o);
      this.words.push({ offer: o, tokens: tokens(o.title ?? "") });
    }
  }

  get size() {
    return this.offers.length;
  }

  byCanonicalUrl(url: string): Offer | undefined {
    return this.byUrl.get(canonicalUrl(url));
  }

  /**
   * Offers worth scoring for a target: exact GTIN/MPN hits first; otherwise the offers sharing
   * the most model-like tokens (those with digits) with the target's name, at most `max`.
   */
  candidates(target: MatchTarget, max = 12): Offer[] {
    const hits = new Set<Offer>();
    for (const id of target.identifiers) {
      if (id.kind === "gtin") this.byGtin.get(id.value)?.forEach((o) => hits.add(o));
      if (id.kind === "mpn") this.byMpn.get(normalizeMpn(id.value))?.forEach((o) => hits.add(o));
    }
    if (hits.size) return [...hits].slice(0, max);
    const want = [...tokens(`${target.query ?? ""} ${target.name}`)].filter((t) => /\d/.test(t));
    if (!want.length) return [];
    return this.words
      .map((w) => ({ offer: w.offer, n: want.filter((t) => w.tokens.has(t)).length }))
      .filter((w) => w.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, max)
      .map((w) => w.offer);
  }
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2),
  );
}

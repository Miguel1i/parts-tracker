/** Product page HTML → Offer. Structured data first, then site selectors, then meta / h1. */
import { load, type CheerioAPI } from "cheerio";
import { normalizeGtin } from "../gtin";
import { nonTitlePhrases, wordsRegex } from "../lexicon/words";
import { fold } from "../match/text";
import { detectBrands } from "../match/tokens";
import type { Offer, OfferPrice, Stock } from "../match/types";
import { asinFromUrl, canonicalUrl, hostOf } from "../match/url";
import { hostProfile, type SellerConfig, type Selectors } from "./hosts";
import { asArray, isType, jsonLdNodes, nameOf, str, type Json } from "./jsonld";
import { readPrice, type FxRates, type PriceInput } from "./price";
import { detectSeller } from "./seller";
import { preorderInTitle, stockFromAvailability, stockFromText } from "./stock";

export interface ExtractOptions {
  /** The shop's currency, used when structured data states none. Default EUR. */
  currency?: string;
  /** `fx_rates`: units of each currency per 1 EUR. */
  rates?: FxRates;
  /** Merchant `adapterConfig.selectors`; override the built-in host profile per field. */
  selectors?: Selectors;
  /** Merchant `adapterConfig.sellerRule`. */
  sellerRule?: SellerConfig;
}

const NON_TITLE = wordsRegex(nonTitlePhrases);
const GTIN_KEYS = ["gtin", "gtin13", "gtin14", "gtin12", "gtin8", "ean", "ean13"];
const TEXT_LIMIT = 30000;
const BREADCRUMBS = [
  '[class*="breadcrumb"] a',
  '[class*="breadcrumb"] li',
  'nav[aria-label*="bread" i] a',
  '[itemtype*="BreadcrumbList"] [itemprop="name"]',
].join(", ");

/** Titles that are boilerplate, not the product: "Grátis", "O resumo do produto …", "Resultados …". */
export function isPlausibleTitle(title: string | undefined): boolean {
  if (!title) return false;
  const t = fold(title);
  if (t.length < 8 || t.length > 300) return false;
  if (t.split(" ").length < 2) return false;
  const head = t.slice(0, 40);
  return !NON_TITLE.test(head);
}

/** `<title>` without the shop suffix ("… : Amazon.es: Eletrónica", "… | PCDiga"). */
function cleanDocumentTitle(title: string, host: string): string {
  const label = host.split(".")[0] ?? "";
  const parts = title.split(/\s+[|:–-]\s+/);
  while (
    parts.length > 1 &&
    fold(parts[parts.length - 1])
      .replace(/\s/g, "")
      .includes(label)
  )
    parts.pop();
  while (parts.length > 1 && fold(parts[parts.length - 1]).length < 25 && parts.length > 2)
    parts.pop();
  return parts.join(" - ").trim();
}

function textOf($: CheerioAPI, selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  const t = $(selector).first().text().replace(/\s+/g, " ").trim();
  return t || undefined;
}

function pickProduct(nodes: Json[]): Json | undefined {
  const products = nodes.filter(
    (n) => isType(n, "Product", "ProductGroup", "IndividualProduct") && str(n.name),
  );
  return products.find((p) => p.offers) ?? products[0];
}

/** Structured offer price: skips strikethrough/list prices and multi-seller "from" prices. */
function jsonLdPrices(product: Json): { inputs: PriceInput[]; notes: string[]; offer?: Json } {
  const inputs: PriceInput[] = [];
  const notes: string[] = [];
  let first: Json | undefined;
  for (const o of asArray(product.offers)) {
    if (!o || typeof o !== "object") continue;
    const offer = o as Json;
    first ??= offer;
    const currency = str(offer.priceCurrency);
    if (isType(offer, "AggregateOffer")) {
      const low = str(offer.lowPrice);
      const high = str(offer.highPrice);
      const count = Number(offer.offerCount ?? 0);
      if (low && (count === 1 || low === high))
        inputs.push({ raw: low, currency, source: "jsonld", structured: true });
      else if (low) notes.push(`ignored "from" price ${low} (${count || "several"} offers)`);
      continue;
    }
    if (str(offer.price))
      inputs.push({ raw: str(offer.price), currency, source: "jsonld", structured: true });
    for (const spec of asArray(offer.priceSpecification)) {
      const s = spec as Json;
      if (!s || typeof s !== "object") continue;
      if (/strikethrough|listprice|msrp/i.test(str(s.priceType) ?? "")) continue;
      if (str(s.price))
        inputs.push({
          raw: str(s.price),
          currency: str(s.priceCurrency) ?? currency,
          source: "jsonld",
          structured: true,
        });
    }
  }
  return { inputs, notes, offer: first };
}

function conditionOf(v: string | undefined): Offer["condition"] {
  if (!v) return undefined;
  if (/refurbished/i.test(v)) return "refurbished";
  if (/used/i.test(v)) return "used";
  if (/damaged/i.test(v)) return "damaged";
  if (/new/i.test(v)) return "new";
  return undefined;
}

export function extractProductPage(html: string, url: string, options: ExtractOptions = {}): Offer {
  const $ = load(html);
  const host = hostOf(url);
  const profile = hostProfile(host);
  const sel: Selectors = { ...profile?.selectors, ...stripEmpty(options.selectors) };
  const shopCurrency = options.currency ?? "EUR";
  const notes: string[] = [];
  const nodes = jsonLdNodes($);
  const product = pickProduct(nodes);
  const productCount = nodes.filter((n) => isType(n, "Product")).length;

  // ---- title
  const candidates: [string, string | undefined][] = [
    ["jsonld", str(product?.name)],
    ["selector", textOf($, sel.title)],
    ["microdata", textOf($, '[itemtype*="schema.org/Product"] [itemprop="name"]')],
    ["og", $('meta[property="og:title"]').attr("content")?.trim()],
    ...$("h1")
      .toArray()
      .map((el) => ["h1", $(el).text().replace(/\s+/g, " ").trim()] as [string, string]),
    ["document", cleanDocumentTitle($("title").first().text().trim(), host)],
  ];
  let title: string | undefined;
  let titleSource: string | undefined;
  for (const [source, t] of candidates) {
    if (!t) continue;
    if (isPlausibleTitle(t)) {
      title = t;
      titleSource = source;
      break;
    }
    notes.push(`title candidate rejected (${source}): "${t.slice(0, 60)}"`);
  }

  // ---- price (B13: the first value that survives the sanity checks)
  const priceInputs: PriceInput[] = [];
  const ld = product ? jsonLdPrices(product) : { inputs: [], notes: [] };
  notes.push(...ld.notes);
  priceInputs.push(...ld.inputs);
  if (sel.price) {
    $(sel.price)
      .slice(0, 3)
      .each((_, el) => {
        const raw = $(el).attr("content") ?? $(el).text();
        const context = `${$(el).parent().text()}`.slice(0, 120);
        priceInputs.push({ raw: raw.trim(), context, source: "selector", structured: false });
      });
  }
  const micro = $('[itemprop="price"]').first();
  if (micro.length)
    priceInputs.push({
      raw: micro.attr("content") ?? micro.text(),
      currency: $('[itemprop="priceCurrency"]').first().attr("content"),
      source: "microdata",
      structured: true,
    });
  for (const prop of ["product:price:amount", "og:price:amount"]) {
    const v = $(`meta[property="${prop}"]`).attr("content");
    if (v)
      priceInputs.push({
        raw: v,
        currency:
          $('meta[property="product:price:currency"]').attr("content") ??
          $('meta[property="og:price:currency"]').attr("content"),
        source: "meta",
        structured: true,
      });
  }
  let price: OfferPrice | undefined;
  for (const input of priceInputs) {
    const r = readPrice(input, shopCurrency, options.rates);
    if ("price" in r) {
      price = r.price;
      break;
    }
    notes.push(`price discarded (${input.source}): ${r.reason}`);
  }

  // ---- identifiers
  const gtins = new Set<string>();
  for (const key of GTIN_KEYS) {
    for (const v of asArray(product?.[key])) {
      const raw = str(v);
      if (!raw) continue;
      const g = normalizeGtin(raw);
      if (g) gtins.add(g);
      else notes.push(`invalid GTIN "${raw}" ignored`);
    }
  }
  $('[itemprop^="gtin"]').each((_, el) => {
    const g = normalizeGtin($(el).attr("content") ?? $(el).text());
    if (g) gtins.add(g);
  });
  const asin =
    (profile?.asinSelector ? $(profile.asinSelector).attr("value")?.trim() : undefined) ||
    asinFromUrl(url) ||
    undefined;

  // ---- brand, category, stock, seller
  let brand = nameOf(product?.brand) ?? $('meta[property="product:brand"]').attr("content")?.trim();
  if (!brand && sel.brand) brand = detectBrands(textOf($, sel.brand) ?? "")[0];
  const hints = new Set<string>();
  for (const n of nodes.filter((n) => isType(n, "BreadcrumbList")))
    for (const item of asArray(n.itemListElement)) {
      const name = nameOf(item) ?? nameOf((item as Json)?.item);
      if (name) hints.add(name);
    }
  for (const c of asArray(product?.category)) if (str(c)) hints.add(str(c)!);
  $(sel.breadcrumb ?? BREADCRUMBS).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t && t.length <= 60) hints.add(t);
  });

  const ldOffer = ld.offer;
  let stock: Stock =
    stockFromAvailability(str(ldOffer?.availability)) ??
    stockFromAvailability(
      $('[itemprop="availability"]').attr("href") ?? $('[itemprop="availability"]').attr("content"),
    ) ??
    stockFromAvailability($('meta[property="product:availability"]').attr("content")) ??
    stockFromText(textOf($, sel.stock)) ??
    "unknown";
  if (preorderInTitle(title)) stock = "preorder";

  const sellerConfig: SellerConfig = {
    ownNames: [host.split(".")[0] ?? ""],
    ...profile?.seller,
    ...stripEmpty(options.sellerRule),
  };
  const seller = detectSeller($, html, sellerConfig, nameOf(ldOffer?.seller));

  // ---- page kind
  const titleFromSelector = titleSource === "selector";
  const pageKind: Offer["pageKind"] =
    productCount >= 6 || (nodes.some((n) => isType(n, "ItemList")) && !product)
      ? "listing"
      : product || titleFromSelector || $('meta[property="og:type"]').attr("content") === "product"
        ? "product"
        : "unknown";

  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, TEXT_LIMIT);
  const image = asArray(product?.image)
    .map((i) => (typeof i === "string" ? i : nameOf(i)))
    .find(Boolean) as string | undefined;

  return {
    url,
    canonicalUrl: canonicalUrl(url),
    stage: "page",
    title,
    titleSource,
    brand,
    gtins: [...gtins],
    mpn: str(product?.mpn),
    sku: str(product?.sku),
    asin: asin?.toUpperCase(),
    price,
    condition: conditionOf(str(ldOffer?.itemCondition) ?? str(product?.itemCondition)),
    stock,
    seller,
    categoryHints: [...hints],
    pageKind,
    text,
    image: image ?? $('meta[property="og:image"]').attr("content") ?? undefined,
    notes,
  };
}

function stripEmpty<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}

/** Search / listing page HTML → listing offers (structured data) and candidate links. */
import { load, type CheerioAPI } from "cheerio";
import { normalizeGtin } from "../gtin";
import type { SearchLink } from "../match/score";
import type { Offer, OfferPrice } from "../match/types";
import { canonicalUrl, hostOf } from "../match/url";
import { hostProfile } from "./hosts";
import { asArray, embeddedJsonNodes, isType, jsonLdNodes, nameOf, str, type Json } from "./jsonld";
import type { ExtractOptions } from "./page";
import { readPrice } from "./price";
import { stockFromAvailability } from "./stock";

export interface SearchPage {
  /** Offers read from JSON-LD, embedded app-state JSON or `adapterConfig.selectors.item`. */
  offers: Offer[];
  /** Every link, merged by URL, with its text and product-card text. */
  links: SearchLink[];
  /** Number of `<a href>` on the page (for the trace). */
  linkCount: number;
}

const CARD = [
  "[data-component-type='s-search-result']",
  "[data-asin]",
  "article",
  "li",
  "[class*='product']",
  "[class*='card']",
  "[class*='item']",
].join(", ");
const PRICE_KEYS = [
  "price",
  "salePrice",
  "finalPrice",
  "currentPrice",
  "priceAmount",
  "sellingPrice",
];
const NAME_KEYS = ["name", "title", "productName"];
const URL_KEYS = ["url", "link", "href", "slug", "path", "productUrl"];

function resolve(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href.trim(), base).toString().split("#")[0]!;
  } catch {
    return null;
  }
}

function listingOffer(
  base: string,
  title: string,
  url: string,
  price: OfferPrice | undefined,
  extra: Partial<Offer> = {},
): Offer {
  return {
    url,
    canonicalUrl: canonicalUrl(url),
    stage: "listing",
    title,
    titleSource: "listing",
    gtins: [],
    price,
    stock: "unknown",
    categoryHints: [],
    pageKind: "product",
    ...extra,
  };
}

type El = ReturnType<CheerioAPI>;

function cleanText(el: El): string {
  return el.text().replace(/\s+/g, " ").trim();
}

function linkText(a: El): string {
  const parts = [
    cleanText(a),
    a.attr("title"),
    a.attr("aria-label"),
    a.find("img").first().attr("alt"),
  ];
  return [
    ...new Set(parts.filter((p): p is string => !!p && !!p.trim()).map((p) => p.trim())),
  ].join(" ");
}

export function extractSearchPage(
  html: string,
  url: string,
  options: ExtractOptions = {},
): SearchPage {
  const $ = load(html);
  const shopCurrency = options.currency ?? "EUR";
  const offers = new Map<string, Offer>();
  const add = (o: Offer) => {
    const key = `${o.canonicalUrl}|${o.title}`;
    if (!offers.has(key)) offers.set(key, o);
  };
  const price = (raw: unknown, currency?: string, structured = true): OfferPrice | undefined => {
    const r = readPrice(
      { raw: str(raw), currency, source: "listing", structured },
      shopCurrency,
      options.rates,
    );
    return "price" in r ? r.price : undefined;
  };

  // JSON-LD Product nodes and ItemList elements
  for (const n of jsonLdNodes($)) {
    if (!isType(n, "Product") || !str(n.name)) continue;
    const offer = asArray(n.offers)[0] as Json | undefined;
    const u = resolve(str(n.url) ?? str(offer?.url), url);
    if (!u) continue;
    const gtin = normalizeGtin(str(n.gtin13) ?? str(n.gtin) ?? str(n.gtin12) ?? null);
    add(
      listingOffer(
        url,
        str(n.name)!,
        u,
        price(offer?.price ?? offer?.lowPrice, str(offer?.priceCurrency)),
        {
          gtins: gtin ? [gtin] : [],
          mpn: str(n.mpn),
          sku: str(n.sku),
          brand: nameOf(n.brand),
          stock: stockFromAvailability(str(offer?.availability)) ?? "unknown",
        },
      ),
    );
  }

  // Embedded app-state JSON: any object with a name, a price and a URL
  for (const n of embeddedJsonNodes($)) {
    const name = NAME_KEYS.map((k) => str(n[k])).find(Boolean);
    const p = PRICE_KEYS.map((k) => n[k]).find(
      (v) => typeof v === "number" || typeof v === "string",
    );
    const u = resolve(URL_KEYS.map((k) => str(n[k])).find(Boolean), url);
    if (!name || p === undefined || !u || name.length < 8) continue;
    const pr = price(p, str(n.currency) ?? str(n.priceCurrency));
    if (pr) add(listingOffer(url, name, u, pr));
  }

  // Merchant-configured result items
  const sel = { ...hostProfile(hostOf(url))?.selectors, ...options.selectors };
  if (options.selectors?.item) {
    $(options.selectors.item).each((_, el) => {
      const item = $(el);
      const a = sel.url ? item.find(sel.url).first() : item.find("a[href]").first();
      const u = resolve(a.attr("href"), url);
      const title = sel.title ? cleanText(item.find(sel.title).first()) : linkText(a);
      const p = sel.price ? item.find(sel.price).first() : undefined;
      if (!u || !title) return;
      const pr = p?.length
        ? readPrice(
            { raw: p.text(), context: p.parent().text(), source: "selector", structured: false },
            shopCurrency,
            options.rates,
          )
        : undefined;
      add(listingOffer(url, title, u, pr && "price" in pr ? pr.price : undefined));
    });
  }

  // Links, merged by URL
  const links = new Map<string, SearchLink>();
  const anchors = $("a[href]");
  anchors.each((_, el) => {
    const a = $(el);
    const href = a.attr("href")!.trim();
    const u = /^(?:javascript|mailto|tel|sms|data):|^#/i.test(href) ? href : resolve(href, url);
    if (!u) return;
    const text = linkText(a);
    const card = a.closest(CARD);
    const cardText = card.length ? cleanText(card) : "";
    const context = cardText.length <= 600 ? cardText.slice(0, 400) : undefined;
    const prev = links.get(u);
    if (prev) {
      if (text && !prev.text.includes(text)) prev.text = `${prev.text} ${text}`.trim();
      if (!prev.context && context) prev.context = context;
    } else links.set(u, { url: u, text, ...(context ? { context } : {}) });
  });

  return { offers: [...offers.values()], links: [...links.values()], linkCount: anchors.length };
}

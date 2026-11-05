/**
 * Offers from a shop's public Saleor storefront API (GraphQL), for shops whose HTML pages are
 * behind a bot wall but whose storefront API is open to any browser (PCDiga). Pure: builds the
 * request bodies and turns responses into `Offer`s; the scraper does the network.
 */
import { normalizeGtin } from "../gtin";
import type { Offer, Stock } from "../match/types";
import { canonicalUrl } from "../match/url";

/** Adapter config for a Saleor shop (`adapterConfig.saleor`). */
export interface SaleorConfig {
  /** GraphQL endpoint, e.g. https://shop.eu.saleor.cloud/graphql/ */
  endpoint: string;
  /** Channel slug that carries the shop's prices, e.g. "default-channel". */
  channel: string;
}

const FIELDS = `name slug isAvailableForPurchase
  thumbnail(size: 512) { url }
  category { slug parent { slug parent { slug parent { slug } } } }
  attributes { attribute { slug } values { name } }
  variants { sku quantityAvailable pricing { price { gross { amount currency } } } }
  pricing { priceRange { start { gross { amount currency } } } }`;

export function saleorSearchBody(cfg: SaleorConfig, query: string, first = 8) {
  return {
    query: `query($q: String, $c: String, $n: Int) { products(first: $n, channel: $c, filter: { search: $q }) { edges { node { ${FIELDS} } } } }`,
    variables: { q: query, c: cfg.channel, n: first },
  };
}

export function saleorProductBody(cfg: SaleorConfig, slug: string) {
  return {
    query: `query($s: String, $c: String) { product(slug: $s, channel: $c) { ${FIELDS} } }`,
    variables: { s: slug, c: cfg.channel },
  };
}

/** The product slug of a shop URL (its last path segment), or null. */
export function saleorSlugFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1];
    return slug && /^[a-z0-9-]{3,300}$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

type Money = { amount?: number; currency?: string } | null | undefined;
type Category = { slug?: string; parent?: Category | null } | null | undefined;
export interface SaleorNode {
  name?: string;
  slug?: string;
  isAvailableForPurchase?: boolean | null;
  thumbnail?: { url?: string } | null;
  category?: Category;
  attributes?: { attribute?: { slug?: string }; values?: { name?: string }[] }[];
  variants?: {
    sku?: string | null;
    quantityAvailable?: number | null;
    pricing?: { price?: { gross?: Money } | null } | null;
  }[];
  pricing?: { priceRange?: { start?: { gross?: Money } | null } | null } | null;
}

/** Products in a search response, or null when the response isn't one. */
export function saleorSearchNodes(json: unknown): SaleorNode[] | null {
  const edges = (json as { data?: { products?: { edges?: { node?: SaleorNode }[] } } })?.data
    ?.products?.edges;
  return Array.isArray(edges) ? edges.flatMap((e) => (e?.node ? [e.node] : [])) : null;
}

/** The product in a by-slug response: a node, null (no such product), or undefined (bad response). */
export function saleorProductNode(json: unknown): SaleorNode | null | undefined {
  const data = (json as { data?: { product?: SaleorNode | null } })?.data;
  return data && "product" in data ? (data.product ?? null) : undefined;
}

function attr(node: SaleorNode, slug: string): string | undefined {
  const a = node.attributes?.find((x) => x.attribute?.slug === slug);
  const v = a?.values?.map((x) => x.name?.trim()).find(Boolean);
  return v || undefined;
}

function categoryPath(c: Category): string[] {
  const out: string[] = [];
  for (let cur = c; cur?.slug && out.length < 6; cur = cur.parent) out.unshift(cur.slug);
  return out;
}

/**
 * One storefront product as an offer. `site` is the shop's public origin; the product URL is
 * `site/<category path>/<slug>` (how the shop links its products). Prices are in the channel's
 * currency; only EUR channels are supported (the offer has no price otherwise).
 */
export function saleorOffer(node: SaleorNode, site: string): Offer {
  const path = [...categoryPath(node.category), node.slug ?? ""].filter(Boolean).join("/");
  const url = `${site.replace(/\/+$/, "")}/${path}`;
  const variant = node.variants?.find((v) => v.pricing?.price?.gross?.amount != null);
  const gross = variant?.pricing?.price?.gross ?? node.pricing?.priceRange?.start?.gross;
  const amount = gross?.amount;
  const currency = gross?.currency ?? "EUR";
  const price =
    typeof amount === "number" && amount > 0 && currency === "EUR"
      ? { value: amount, currency, eur: amount, source: "api", raw: `${amount} ${currency}` }
      : undefined;

  const qty = node.variants?.reduce((n, v) => n + Math.max(0, v.quantityAvailable ?? 0), 0);
  let stock: Stock = "unknown";
  if (node.isAvailableForPurchase === false) stock = "out_of_stock";
  else if (qty != null && node.variants?.some((v) => v.quantityAvailable != null))
    stock = qty > 0 ? "in_stock" : "out_of_stock";
  else if (node.isAvailableForPurchase) stock = "in_stock";

  // The EAN attribute, else the 8–14 digit code the slug ends with (PCDiga appends it).
  const slugCode = node.slug?.match(/-(\d{8,14})$/)?.[1];
  const gtins = [attr(node, "ean"), attr(node, "gtin"), slugCode]
    .map((g) => normalizeGtin(g))
    .filter((g): g is string => g != null);

  const image = node.thumbnail?.url;
  return {
    url,
    canonicalUrl: canonicalUrl(url),
    stage: "page",
    title: node.name?.trim() || undefined,
    titleSource: "api",
    brand: attr(node, "manufacturer") ?? attr(node, "marca"),
    gtins: [...new Set(gtins)],
    mpn: attr(node, "partnumber"),
    sku: variant?.sku ?? undefined,
    price,
    stock,
    // Storefront API of the shop itself: no marketplace sellers.
    seller: { own: true, evidence: "storefront api" },
    categoryHints: categoryPath(node.category),
    pageKind: "product",
    image: image && /^https:\/\//i.test(image) ? image : undefined,
  };
}
